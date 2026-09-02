import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  discoverPeople,
  findEmails,
  hasEmailIdentity,
  OpporaApiError,
  OPPORA_EMPLOYEE_COUNTS,
  type DiscoveredPerson,
  type EmailLookupResult,
} from '@/services/oppora';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export type DecisionMakerRole = 'hr_talent' | 'founders_execs' | 'sales_marketing';

/**
 * Oppora's `title` filter is free text, ORed, and fuzzy ("contains"), so each
 * role preset is a handful of titles. Selecting several roles ORs all of them.
 */
const ROLE_TITLES: Record<DecisionMakerRole, string[]> = {
  hr_talent: ['Human Resources', 'HR Manager', 'Head of People', 'People Operations', 'Talent Acquisition', 'Recruiter', 'Recruiting'],
  founders_execs: ['Founder', 'Co-Founder', 'CEO', 'Owner', 'President', 'Managing Director'],
  sales_marketing: ['VP Sales', 'Head of Sales', 'Sales Director', 'Chief Revenue Officer', 'CMO', 'VP Marketing', 'Head of Marketing', 'Marketing Director'],
};

/** Legacy PDL size bucket → Oppora bucket. */
const SIZE_ALIASES: Record<string, string> = { '1-10': '2-10' };

function opporaHttpStatus(err: any): number {
  const status = err instanceof OpporaApiError ? err.statusCode : Number(err?.statusCode);
  if (status === 402) return 402;
  if (status === 429) return 429;
  if (status === 401 || status === 400 || status === 422) return 400;
  if (status >= 500) return 502;
  return 400;
}

// Discovery is one call, but per-lead email lookups + DB writes add up on big pages.
export const maxDuration = 120;

/** Title keywords are comma-separated. */
function parseTitleKeywords(keywords?: string | null): string[] {
  return (keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && k.replace(/\*/g, '').length > 0);
}

/** Best-guess work email (first.last@domain) when Oppora can't find the real one. */
function bestGuessEmail(p: DiscoveredPerson): string | null {
  if (!p.companyDomain || !p.firstName || !p.lastName) return null;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const f = clean(p.firstName);
  const l = clean(p.lastName);
  if (!f || !l) return null;
  return `${f}.${l}@${p.companyDomain}`;
}

type EmailOutcome = { email: string | null; emailStatus: string; verifiedAt: Date | null };

function scoreLead(p: DiscoveredPerson, email: EmailOutcome): { score: number; tier: string } {
  let score = 0;
  if (email.emailStatus === 'Valid') score += 40;
  else if (email.emailStatus === 'Risky') score += 30;
  else if (email.emailStatus === 'guessed') score += 20;
  if (p.linkedinUrl) score += 20;
  if (p.companyWebsite) score += 20;
  if (p.jobTitle) score += 10;

  const level = (p.managementLevel || '').toLowerCase();
  const title = (p.jobTitle || '').toLowerCase();
  if (['c-level', 'cxo', 'owner', 'partner'].some((s) => level.includes(s)) || /\b(founder|ceo|owner|president)\b/.test(title)) score += 10;
  else if (['vice president', 'vp', 'director'].some((s) => level.includes(s))) score += 5;

  score = Math.min(score, 100);
  const tier = score >= 75 ? 'Hot' : score >= 45 ? 'Warm' : 'Cold';
  return { score, tier };
}

function buildInsight(p: DiscoveredPerson, businessName: string): string {
  const who = p.jobTitle || 'a decision-maker';
  const industry = p.companyIndustry ? ` in ${p.companyIndustry}` : '';
  const sizeNote = p.companySize ? ` (${p.companySize} employees)` : '';
  return `Reach ${who} at ${businessName}${industry}${sizeNote} — a strong fit for outreach based on role seniority and available contact details.`;
}

function normLinkedin(url: string | null | undefined): string | null {
  return url?.trim().toLowerCase().replace(/\/+$/, '') || null;
}

export async function POST(req: Request) {
  try {
    return await handleFindLeads(req);
  } catch (err: any) {
    console.error('Find leads failed:', err);
    return NextResponse.json(
      { error: err?.message || 'Search failed. Please try again.' },
      { status: 500 }
    );
  }
}

async function handleFindLeads(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let apiKey: string;
  try {
    apiKey = await resolveUserApiKey(user.id, 'oppora');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError || e?.name === 'ByokKeyMissingError') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    industry,
    keywords,
    location,
    country,
    companySizes,
    roles,
    size,
    page,
    scrollToken,
    findEmails: wantEmails,
  } = payload as {
    industry?: string;
    keywords?: string;
    location?: string;
    country?: string;
    companySizes?: string[];
    roles?: DecisionMakerRole[];
    size?: number;
    /** 1-based, for display only — Oppora paging is cursor-based. */
    page?: number;
    scrollToken?: string | null;
    /** Look up a work email per new lead via Oppora (1 credit per email found). Default true. */
    findEmails?: boolean;
  };

  if (!industry?.trim() && !keywords?.trim() && !location?.trim()) {
    return NextResponse.json(
      { error: 'Please provide an industry, title keywords, or a region to search.' },
      { status: 400 }
    );
  }

  const currentPage = Math.max(page ?? 1, 1);
  const pageSize = Math.min(Math.max(size ?? 25, 1), 100);
  const lookupEmails = wantEmails !== false;

  // Keywords are more specific than the role presets, so they replace them.
  const keywordTitles = parseTitleKeywords(keywords);
  const roleList = roles && roles.length > 0 ? roles : (['hr_talent', 'founders_execs'] as DecisionMakerRole[]);
  const roleTitles = Array.from(new Set(roleList.flatMap((r) => ROLE_TITLES[r] || [])));
  const titles = keywordTitles.length > 0 ? keywordTitles : roleTitles;

  const employeeCounts = (companySizes || [])
    .map((s) => SIZE_ALIASES[s] || s)
    .filter((s) => OPPORA_EMPLOYEE_COUNTS.includes(s));

  // Oppora's person location is city/state; country is only a fallback when no region is given.
  const region = location?.trim();
  const countryName = country?.trim();
  const locations = region ? [region] : countryName ? [countryName] : [];

  let discovery: Awaited<ReturnType<typeof discoverPeople>>;
  try {
    discovery = await discoverPeople(apiKey, {
      titles,
      industries: industry?.trim() ? [industry.trim()] : [],
      employeeCounts,
      locations,
      limit: pageSize,
      cursor: scrollToken || null,
    });
  } catch (err: any) {
    console.error('Oppora discovery error:', err);
    return NextResponse.json(
      { error: err?.message || 'Oppora people search failed' },
      { status: opporaHttpStatus(err) }
    );
  }

  const records = discovery.people;
  const total = discovery.total ?? 0;
  const pagination = {
    page: currentPage,
    perPage: pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    scrollToken: discovery.nextCursor,
    hasMore: discovery.hasMore,
  };

  if (records.length === 0) {
    return NextResponse.json({
      leads: [],
      pagination,
      appliedTitles: titles,
      newCount: 0,
      duplicateCount: 0,
      creditsUsed: discovery.creditCharged,
      creditsRemaining: discovery.creditsRemaining,
      message:
        currentPage > 1
          ? 'No more results — you have reached the end of this search.'
          : 'No matching people were found for these criteria.',
    });
  }

  // ---- Skip anyone this user already has, so nothing is fetched (or charged for) twice.
  const keyed = records.map((rec) => ({
    rec,
    linkedin: normLinkedin(rec.linkedinUrl),
    guessedEmail: bestGuessEmail(rec),
  }));
  const linkedins = keyed.map((k) => k.linkedin).filter(Boolean) as string[];
  const guessedEmails = keyed.map((k) => k.guessedEmail).filter(Boolean) as string[];

  const or: any[] = [];
  if (linkedins.length) or.push({ linkedinUrl: { in: linkedins } });
  if (guessedEmails.length) or.push({ email: { in: guessedEmails } });

  let existing: any[] = [];
  try {
    existing = or.length
      ? await prisma.lead.findMany({
          where: { userId: user.id, OR: or },
          select: {
            id: true,
            externalId: true,
            linkedinUrl: true,
            email: true,
            businessName: true,
            website: true,
            phone: true,
            address: true,
            industry: true,
            fullName: true,
            jobTitle: true,
            emailStatus: true,
            leadScore: true,
            leadTier: true,
            aiInsight: true,
            createdAt: true,
          },
        })
      : [];
  } catch (err) {
    // A dedupe failure must not sink the search — worst case we save a duplicate.
    console.error('Dedupe lookup failed:', err);
  }

  const byLinkedin = new Map<string, any>();
  const byEmail = new Map<string, any>();
  for (const lead of existing) {
    if (lead.linkedinUrl) byLinkedin.set(normLinkedin(lead.linkedinUrl) as string, lead);
    if (lead.email) byEmail.set(lead.email.toLowerCase(), lead);
  }

  const seenInPage = new Set<string>();
  const fresh: (typeof keyed)[number][] = [];
  const duplicates: { rec: DiscoveredPerson; lead: any }[] = [];

  for (const k of keyed) {
    const match = (k.linkedin && byLinkedin.get(k.linkedin)) || (k.guessedEmail && byEmail.get(k.guessedEmail)) || null;
    if (match) {
      duplicates.push({ rec: k.rec, lead: match });
      continue;
    }
    const pageKey = k.linkedin || k.guessedEmail || `${k.rec.fullName}|${k.rec.companyName}`;
    if (seenInPage.has(pageKey)) continue;
    seenInPage.add(pageKey);
    fresh.push(k);
  }

  // ---- Work emails: Oppora email finder for new leads only (1 credit per hit), else best-guess pattern.
  const emailOutcomes = new Map<number, EmailOutcome>(); // index into `fresh`
  let emailsFound = 0;
  let emailWarning: string | null = null;

  if (lookupEmails && fresh.length > 0) {
    const targets = fresh
      .map((k, i) => ({ i, input: { firstName: k.rec.firstName, lastName: k.rec.lastName, fullName: k.rec.fullName, domain: k.rec.companyDomain } }))
      .filter((t) => hasEmailIdentity(t.input));

    let results: EmailLookupResult[] = [];
    try {
      results = await findEmails(targets.map((t) => t.input), apiKey);
    } catch (err: any) {
      if (!(err instanceof OpporaApiError)) throw err;
      results = err.partial || [];
      emailWarning = err.message;
    }

    const foundAt = new Date();
    targets.forEach((t, idx) => {
      const r = results[idx];
      if (r && r.email && (r.status === 'Valid' || r.status === 'Risky')) {
        emailsFound += 1;
        emailOutcomes.set(t.i, { email: r.email, emailStatus: r.status, verifiedAt: foundAt });
      }
    });
  }

  const outcomeFor = (k: (typeof fresh)[number], i: number): EmailOutcome =>
    emailOutcomes.get(i) ||
    (k.guessedEmail
      ? { email: k.guessedEmail, emailStatus: 'guessed', verifiedAt: null }
      : { email: null, emailStatus: 'unavailable', verifiedAt: null });

  let created: any[] = [];
  try {
    created = await Promise.all(
      fresh.map(async (k, i) => {
        const rec = k.rec;
        const businessName = rec.companyName || 'Unknown Company';
        const emailOutcome = outcomeFor(k, i);
        const { score, tier } = scoreLead(rec, emailOutcome);
        const address = [rec.city, rec.state, rec.country].filter(Boolean).join(', ') || rec.location;
        const lead = await prisma.lead.create({
          data: {
            userId: user.id,
            businessName,
            phone: null,
            email: emailOutcome.email,
            emailStatus: emailOutcome.emailStatus,
            emailVerifiedAt: emailOutcome.verifiedAt,
            website: rec.companyWebsite,
            address: address || null,
            industry: rec.companyIndustry,
            country: rec.country || countryName || null,
            location: rec.state || region || null,
            fullName: rec.fullName,
            firstName: rec.firstName,
            lastName: rec.lastName,
            jobTitle: rec.jobTitle,
            linkedinUrl: rec.linkedinUrl,
            externalId: null,
            leadScore: score,
            leadTier: tier,
            aiInsight: buildInsight(rec, businessName),
            source: 'Oppora',
            status: 'New',
            leadType: 'client',
            rawData: rec.raw ?? undefined,
          },
        });
        // companySize has no column on Lead — surface it on the response only.
        return { ...lead, companySize: rec.companySize, isNew: true };
      })
    );
  } catch (err: any) {
    console.error('Failed to save Oppora leads:', err);
    return NextResponse.json({ error: 'Found leads but failed to save them.' }, { status: 500 });
  }

  // Duplicates still come back — flagged, and carrying their existing row id so
  // they can be selected for a campaign without creating a second copy.
  const dupePayload = duplicates.map(({ rec, lead }) => ({
    ...lead,
    companySize: rec.companySize,
    isNew: false,
    savedAt: lead.createdAt,
  }));

  const creditsUsed = discovery.creditCharged + emailsFound;
  const noticeParts = [
    `Used ${creditsUsed} Oppora ${creditsUsed === 1 ? 'credit' : 'credits'} (${discovery.creditCharged} for the search${lookupEmails ? `, ${emailsFound} for ${emailsFound === 1 ? 'email' : 'emails'} found` : ''}).`,
  ];
  if (typeof discovery.creditsRemaining === 'number') {
    noticeParts.push(`${(discovery.creditsRemaining - emailsFound).toLocaleString()} data credits remaining.`);
  }
  if (emailWarning) noticeParts.push(`Email lookup stopped early: ${emailWarning}`);
  if (!lookupEmails) noticeParts.push('Emails shown are best-guess patterns — turn on “Find work emails” or use Verify Leads later.');

  return NextResponse.json({
    leads: [...created, ...dupePayload],
    pagination,
    appliedTitles: titles,
    newCount: created.length,
    duplicateCount: dupePayload.length,
    creditsUsed,
    creditsRemaining: typeof discovery.creditsRemaining === 'number' ? discovery.creditsRemaining - emailsFound : null,
    notice: noticeParts.join(' '),
  });
}
