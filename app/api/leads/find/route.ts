import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { searchLeads, type LeadRecord, type DecisionMakerRole } from '@/services/peopledatalabs';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

// PDL searches are fast, but scoring + DB writes can add up on large result sets.
export const maxDuration = 120;

function scoreLead(rec: LeadRecord): { score: number; tier: string } {
  let score = 0;
  if (rec.emailStatus === 'verified') score += 40;
  else if (rec.emailStatus === 'guessed') score += 20;
  if (rec.linkedinUrl) score += 20;
  if (rec.website) score += 20;
  if (rec.jobTitle) score += 10;

  const seniority = (rec.seniority || '').toLowerCase();
  if (['owner', 'cxo', 'partner'].some((s) => seniority.includes(s))) score += 10;
  else if (['vp', 'director'].some((s) => seniority.includes(s))) score += 5;

  score = Math.min(score, 100);
  const tier = score >= 75 ? 'Hot' : score >= 45 ? 'Warm' : 'Cold';
  return { score, tier };
}

function buildInsight(rec: LeadRecord): string {
  const who = rec.jobTitle || 'a decision-maker';
  const industry = rec.industry ? ` in ${rec.industry}` : '';
  const sizeNote = rec.companySize ? ` (${rec.companySize} employees)` : '';
  return `Reach ${who} at ${rec.businessName}${industry}${sizeNote} — a strong fit for outreach based on role seniority and available contact details.`;
}

/** Normalized dedupe keys — PDL id first, then LinkedIn URL, then email. */
function dedupeKeys(rec: { pdlId?: string | null; linkedinUrl?: string | null; email?: string | null }) {
  return {
    pdlId: rec.pdlId?.trim() || null,
    linkedin: rec.linkedinUrl?.trim().toLowerCase().replace(/\/+$/, '') || null,
    email: rec.email?.trim().toLowerCase() || null,
  };
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let apiKey: string;
  try {
    apiKey = await resolveUserApiKey(user.id, 'pdl');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError) {
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
  } = payload as {
    industry?: string;
    keywords?: string;
    location?: string;
    country?: string;
    companySizes?: string[];
    roles?: DecisionMakerRole[];
    size?: number;
    /** 1-based, for display only — PDL paging is cursor-based. */
    page?: number;
    scrollToken?: string | null;
  };

  if (!industry && !keywords && !location) {
    return NextResponse.json(
      { error: 'Please provide an industry, keywords, or a region to search.' },
      { status: 400 }
    );
  }

  const currentPage = Math.max(page ?? 1, 1);

  let records: LeadRecord[];
  let total = 0;
  let nextScrollToken: string | null = null;
  let appliedTitles: string[] = [];
  let notice: string | undefined;
  try {
    const result = await searchLeads(apiKey, {
      industry,
      keywords,
      location,
      country,
      companySizes,
      roles,
      size,
      scrollToken,
    });
    records = result.leads;
    total = result.total;
    nextScrollToken = result.scrollToken;
    appliedTitles = result.appliedTitles;
    notice = result.notice;
  } catch (err: any) {
    console.error('PDL search error:', err);
    return NextResponse.json({ error: err.message || 'People Data Labs search failed' }, { status: 502 });
  }

  const pageSize = Math.min(Math.max(size ?? 25, 1), 100);
  const pagination = {
    page: currentPage,
    perPage: pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    scrollToken: nextScrollToken,
    hasMore: !!nextScrollToken && records.length > 0,
  };

  if (records.length === 0) {
    return NextResponse.json({
      leads: [],
      pagination,
      appliedTitles,
      newCount: 0,
      duplicateCount: 0,
      message:
        notice ||
        (currentPage > 1
          ? 'No more results — you have reached the end of this search.'
          : 'No matching companies were found for these criteria.'),
    });
  }

  // ---- Skip anyone this user already has, so nothing is fetched into the DB twice.
  const keyed = records.map((rec) => ({ rec, keys: dedupeKeys(rec) }));
  const pdlIds = keyed.map((k) => k.keys.pdlId).filter(Boolean) as string[];
  const linkedins = keyed.map((k) => k.keys.linkedin).filter(Boolean) as string[];
  const emails = keyed.map((k) => k.keys.email).filter(Boolean) as string[];

  const or: any[] = [];
  if (pdlIds.length) or.push({ externalId: { in: pdlIds } });
  if (linkedins.length) or.push({ linkedinUrl: { in: linkedins } });
  if (emails.length) or.push({ email: { in: emails } });

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

  const byPdlId = new Map<string, any>();
  const byLinkedin = new Map<string, any>();
  const byEmail = new Map<string, any>();
  for (const lead of existing) {
    if (lead.externalId) byPdlId.set(lead.externalId, lead);
    if (lead.linkedinUrl) byLinkedin.set(lead.linkedinUrl.toLowerCase().replace(/\/+$/, ''), lead);
    if (lead.email) byEmail.set(lead.email.toLowerCase(), lead);
  }

  const findExisting = (keys: ReturnType<typeof dedupeKeys>) =>
    (keys.pdlId && byPdlId.get(keys.pdlId)) ||
    (keys.linkedin && byLinkedin.get(keys.linkedin)) ||
    (keys.email && byEmail.get(keys.email)) ||
    null;

  // Also guard against the same person appearing twice inside one page.
  const seenInPage = new Set<string>();
  const fresh: LeadRecord[] = [];
  const duplicates: { rec: LeadRecord; lead: any }[] = [];

  for (const { rec, keys } of keyed) {
    const match = findExisting(keys);
    if (match) {
      duplicates.push({ rec, lead: match });
      continue;
    }
    const pageKey = keys.pdlId || keys.linkedin || keys.email;
    if (pageKey && seenInPage.has(pageKey)) continue;
    if (pageKey) seenInPage.add(pageKey);
    fresh.push(rec);
  }

  let created: any[] = [];
  try {
    created = await Promise.all(
      fresh.map(async (rec) => {
        const { score, tier } = scoreLead(rec);
        const lead = await prisma.lead.create({
          data: {
            userId: user.id,
            businessName: rec.businessName,
            phone: rec.phone,
            email: rec.email,
            emailStatus: rec.emailStatus,
            website: rec.website,
            address: rec.address,
            industry: rec.industry,
            country: country || null,
            location: location || null,
            fullName: rec.fullName,
            firstName: rec.firstName,
            lastName: rec.lastName,
            jobTitle: rec.jobTitle,
            linkedinUrl: rec.linkedinUrl,
            externalId: rec.pdlId,
            leadScore: score,
            leadTier: tier,
            aiInsight: buildInsight(rec),
            source: 'PeopleDataLabs',
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
    console.error('Failed to save PDL leads:', err);
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

  return NextResponse.json({
    leads: [...created, ...dupePayload],
    pagination,
    appliedTitles,
    newCount: created.length,
    duplicateCount: dupePayload.length,
    notice,
  });
}
