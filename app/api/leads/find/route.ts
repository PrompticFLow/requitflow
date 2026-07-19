import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { searchLeads, type LeadRecord, type DecisionMakerRole } from '@/services/peopledatalabs';

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

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'People Data Labs API key missing. Please add PDL_API_KEY to your environment.' },
      { status: 400 }
    );
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
    maxResults,
  } = payload as {
    industry?: string;
    keywords?: string;
    location?: string;
    country?: string;
    companySizes?: string[];
    roles?: DecisionMakerRole[];
    maxResults?: number;
  };

  if (!industry && !keywords && !location) {
    return NextResponse.json(
      { error: 'Please provide an industry, keywords, or a region to search.' },
      { status: 400 }
    );
  }

  let records: LeadRecord[];
  let notice: string | undefined;
  try {
    const result = await searchLeads(apiKey, {
      industry,
      keywords,
      location,
      country,
      companySizes,
      roles,
      maxResults,
    });
    records = result.leads;
    notice = result.notice;
  } catch (err: any) {
    console.error('PDL search error:', err);
    return NextResponse.json({ error: err.message || 'People Data Labs search failed' }, { status: 502 });
  }

  if (records.length === 0) {
    return NextResponse.json({ leads: [], message: notice || 'No matching companies were found for these criteria.' });
  }

  try {
    const createdLeads = await Promise.all(
      records.map(async (rec) => {
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
        return { ...lead, companySize: rec.companySize };
      })
    );

    return NextResponse.json({ leads: createdLeads, notice });
  } catch (err: any) {
    console.error('Failed to save PDL leads:', err);
    return NextResponse.json({ error: 'Found leads but failed to save them.' }, { status: 500 });
  }
}
