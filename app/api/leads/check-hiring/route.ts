import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { researchHiring } from '@/services/hiring-research';

export const maxDuration = 60;

// Each Perplexity search takes several seconds, so keep batches small enough
// to finish inside maxDuration; the client chunks larger selections.
const MAX_BATCH = 10;
const CONCURRENCY = 4;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'Hiring research is not configured (missing OpenRouter API key).' }, { status: 500 });
  }

  try {
    const { leadIds, force } = await req.json();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected.' }, { status: 400 });
    }
    if (leadIds.length > MAX_BATCH) {
      return NextResponse.json({ error: `Send at most ${MAX_BATCH} leads per request.` }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, userId: user.id },
      select: {
        id: true, businessName: true, website: true, category: true,
        country: true, location: true, linkedinUrl: true, hiringCheckedAt: true,
      },
    });

    // Skip leads already researched unless the caller explicitly asks to re-check.
    const pending = force ? leads : leads.filter(l => !l.hiringCheckedAt);
    const alreadyChecked = leads.length - pending.length;

    if (pending.length === 0) {
      return NextResponse.json({
        checked: 0,
        alreadyChecked,
        summary: {},
        errors: [],
        results: [],
        message: 'All selected leads were already checked.',
      });
    }

    const checkedAt = new Date();
    const results: Array<{ id: string; result: Awaited<ReturnType<typeof researchHiring>> }> = [];
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async lead => ({
        id: lead.id,
        result: await researchHiring(lead),
      })));
      results.push(...batchResults);
    }

    // Persist only successful lookups; an API error must not stamp the lead as checked.
    const successful = results.filter(r => !r.result.error);
    await prisma.$transaction(
      successful.map(r =>
        prisma.lead.update({
          where: { id: r.id },
          data: {
            hiringStatus: r.result.status,
            hiringSignal: r.result.signal,
            hiringSourceUrl: r.result.sourceUrl,
            hiringJobCount: r.result.jobCount,
            hiringCheckedAt: checkedAt,
          },
        })
      )
    );

    const summary = successful.reduce<Record<string, number>>((acc, r) => {
      acc[r.result.status] = (acc[r.result.status] || 0) + 1;
      return acc;
    }, {});

    const errors = results
      .filter(r => r.result.error)
      .map(r => r.result.error as string);

    return NextResponse.json({
      checked: successful.length,
      alreadyChecked,
      summary,
      errors,
      results: successful.map(r => ({
        id: r.id,
        hiringStatus: r.result.status,
        hiringSignal: r.result.signal,
        hiringSourceUrl: r.result.sourceUrl,
        hiringJobCount: r.result.jobCount,
        hiringCheckedAt: checkedAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error('Hiring check error:', err);
    return NextResponse.json({ error: err.message || 'Hiring check failed' }, { status: 500 });
  }
}
