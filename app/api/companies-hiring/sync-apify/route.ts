import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runApifyActor } from '@/lib/hiring/apify';
import { normalizeApifyJob } from '@/lib/hiring/normalization';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

// Allow up to 5 minutes for Apify actor runs (Vercel Pro/Hobby max)
export const maxDuration = 300;


const ALL_SOURCES = ['linkedin', 'indeed', 'google_jobs', 'remote_jobs', 'world_jobs'] as const;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ status: 'Unauthorized' }, { status: 401 });
    }

    try {
      await resolveUserApiKey(user.id, 'apify');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ status: e.message });
      }
      throw e;
    }

    return NextResponse.json({
      status: 'Apify connected',
      actors: {
        linkedin: !!process.env.APIFY_LINKEDIN_JOBS_ACTOR,
        indeed: !!process.env.APIFY_INDEED_JOBS_ACTOR,
        google_jobs: !!process.env.APIFY_GOOGLE_JOBS_ACTOR,
        remote_jobs: !!process.env.APIFY_REMOTE_JOBS_ACTOR,
        world_jobs: !!process.env.APIFY_WORLD_JOBS_ACTOR,
      }
    });
  } catch (error) {
    return NextResponse.json({ status: 'Error checking Apify status.' }, { status: 500 });
  }
}

// ─── Shared: save normalized jobs to DB ───────────────────────────────────────
async function saveNormalizedJobs(normalizedJobs: any[]) {
  let companiesCreated = 0;
  let companiesUpdated = 0;
  let jobsAdded = 0;
  let duplicatesSkipped = 0;
  const companiesRefreshed = new Set<string>();

  for (const job of normalizedJobs) {
    if (!job.companyName) continue;

    let company = await prisma.company.findFirst({ where: { name: job.companyName } });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: job.companyName,
          country: job.country,
          location: job.location,
          source: job.source,
          latestPostingDate: job.postedAt
        }
      });
      companiesCreated++;
    } else {
      companiesUpdated++;
    }

    companiesRefreshed.add(company.id);

    // Deduplicate jobs by externalId → applyUrl → (company + title + location)
    let existingJob = null;
    if (job.sourceJobId) {
      existingJob = await prisma.job.findFirst({ where: { externalId: job.sourceJobId } });
    }
    if (!existingJob && job.applyUrl) {
      existingJob = await prisma.job.findFirst({ where: { applicationUrl: job.applyUrl } });
    }
    if (!existingJob) {
      existingJob = await prisma.job.findFirst({
        where: { companyId: company.id, title: job.title, location: job.location }
      });
    }

    if (existingJob) {
      duplicatesSkipped++;
      await prisma.job.update({ where: { id: existingJob.id }, data: { lastSeenAt: new Date() } });
    } else {
      await prisma.job.create({
        data: {
          externalId: job.sourceJobId,
          companyId: company.id,
          source: job.source,
          title: job.title,
          category: job.category,
          description: job.description,
          location: job.location,
          city: job.city,
          country: job.country,
          workMode: job.remoteType === 'REMOTE' ? 'Remote' : (job.remoteType === 'HYBRID' ? 'Hybrid' : 'On-site'),
          jobType: job.employmentType,
          salaryMin: job.salaryMin ? parseFloat(job.salaryMin) : null,
          salaryMax: job.salaryMax ? parseFloat(job.salaryMax) : null,
          salaryCurrency: job.currency,
          datePosted: job.postedAt,
          applicationUrl: job.applyUrl,
          vacancies: job.exactHeadcount,
          descriptionHash: job.descriptionHash,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        }
      });
      jobsAdded++;
    }
  }

  // Recalculate company metrics for all touched companies
  for (const companyId of Array.from(companiesRefreshed)) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, include: { jobs: true } });
    if (!company) continue;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let recent7 = 0;
    let latest: Date | null = null;

    company.jobs.forEach((j: any) => {
      if (j.datePosted) {
        if (j.datePosted >= sevenDaysAgo) recent7++;
        if (!latest || j.datePosted > latest) latest = j.datePosted;
      }
    });

    let calculatedActivity = 'Low';
    if (company.jobs.length >= 10 || recent7 >= 5) calculatedActivity = 'High';
    else if (company.jobs.length >= 3) calculatedActivity = 'Medium';

    await prisma.company.update({
      where: { id: companyId },
      data: {
        activeJobPostCount: company.jobs.length,
        latestPostingDate: latest || company.latestPostingDate,
        hiringActivity: calculatedActivity,
      }
    });
  }

  return { companiesCreated, companiesUpdated, jobsAdded, duplicatesSkipped, companiesRefreshed: companiesRefreshed.size };
}

// ─── Normalize raw jobs from one source ───────────────────────────────────────
function normalizeSource(rawJobs: any[], source: string) {
  const normalized: any[] = [];
  for (const j of rawJobs) {
    try {
      const n = normalizeApifyJob(j, source);
      if (n.companyName === 'Unknown Company' && n.title === 'Unknown Title') continue;
      normalized.push(n);
    } catch { /* skip bad items */ }
  }
  return normalized;
}

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database connection is not configured. Please add DATABASE_URL in environment variables.' }, { status: 500 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized. Please log in again.' }, { status: 401 });
    }

    let apifyToken: string;
    try {
      apifyToken = await resolveUserApiKey(user.id, 'apify');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    const body = await req.json();
    const { source, keyword, location, country, maxResults: rawMaxResults } = body;

    const validSources = [...ALL_SOURCES, 'all'];
    if (!validSources.includes(source)) {
      return NextResponse.json({ success: false, error: 'Invalid source.' }, { status: 400 });
    }
    if (typeof keyword !== 'string' || keyword.trim() === '') {
      return NextResponse.json({ success: false, error: 'Keyword is required.' }, { status: 400 });
    }

    const maxResults = Number(rawMaxResults);
    if (isNaN(maxResults) || maxResults <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid maxResults.' }, { status: 400 });
    }

    // ── ALL SOURCES: run every actor in parallel ──────────────────────────────
    if (source === 'all') {
      const sourceList = ALL_SOURCES.filter(s => {
        const envMap: Record<string, string | undefined> = {
          linkedin: process.env.APIFY_LINKEDIN_JOBS_ACTOR,
          indeed: process.env.APIFY_INDEED_JOBS_ACTOR,
          google_jobs: process.env.APIFY_GOOGLE_JOBS_ACTOR,
          remote_jobs: process.env.APIFY_REMOTE_JOBS_ACTOR,
          world_jobs: process.env.APIFY_WORLD_JOBS_ACTOR,
        };
        return !!envMap[s]; // only run sources that have an actor configured
      });

      if (sourceList.length === 0) {
        return NextResponse.json({ success: false, error: 'No Apify actors are configured. Add actor IDs to your .env file.' }, { status: 400 });
      }

      // Run all configured actors in parallel
      const perSourceResults = await Promise.allSettled(
        sourceList.map(async (src) => {
          const raw = await runApifyActor(src, keyword, location || '', country || '', maxResults, apifyToken);
          const normalized = normalizeSource(raw, src);
          return { source: src, rawCount: raw.length, normalizedCount: normalized.length, normalized };
        })
      );

      // Collect all normalized jobs across sources
      const allNormalized: any[] = [];
      const sourceBreakdown: Record<string, { status: string; jobsFound: number; error?: string }> = {};

      for (let i = 0; i < sourceList.length; i++) {
        const src = sourceList[i];
        const result = perSourceResults[i];
        if (result.status === 'fulfilled') {
          allNormalized.push(...result.value.normalized);
          sourceBreakdown[src] = { status: 'success', jobsFound: result.value.normalizedCount };
        } else {
          sourceBreakdown[src] = { status: 'error', jobsFound: 0, error: result.reason?.message || 'Failed' };
        }
      }

      if (allNormalized.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No jobs found across any source. Check actor configurations or try different keywords.',
          sourceBreakdown,
        }, { status: 200 });
      }

      const saved = await saveNormalizedJobs(allNormalized);

      return NextResponse.json({
        success: true,
        source: 'all',
        jobsFound: saved.jobsAdded + saved.duplicatesSkipped,
        jobsAdded: saved.jobsAdded,
        companiesFound: saved.companiesRefreshed,
        companiesCreated: saved.companiesCreated,
        companiesUpdated: saved.companiesUpdated,
        duplicatesSkipped: saved.duplicatesSkipped,
        sourceBreakdown,
        message: `Synced from ${sourceList.length} sources. ${saved.jobsAdded} new jobs added.`
      });
    }

    // ── SINGLE SOURCE ─────────────────────────────────────────────────────────
    let rawJobs: any[] = [];
    try {
      rawJobs = await runApifyActor(source, keyword, location || '', country || '', maxResults, apifyToken);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message || 'Apify job sync failed.' }, { status: 500 });
    }

    if (!Array.isArray(rawJobs) || (rawJobs.length > 0 && typeof rawJobs[0] !== 'object')) {
      return NextResponse.json({ success: false, error: 'Job data sync failed for this source. The actor output format may need mapping.' }, { status: 500 });
    }

    const normalizedJobs = normalizeSource(rawJobs, source);

    if (rawJobs.length > 0 && normalizedJobs.length === 0) {
      return NextResponse.json({ success: false, error: 'Job data sync failed for this source. The actor output format may need mapping.' }, { status: 500 });
    }

    const saved = await saveNormalizedJobs(normalizedJobs);

    return NextResponse.json({
      success: true,
      source,
      jobsFound: saved.jobsAdded + saved.duplicatesSkipped,
      jobsAdded: saved.jobsAdded,
      companiesFound: saved.companiesRefreshed,
      companiesCreated: saved.companiesCreated,
      companiesUpdated: saved.companiesUpdated,
      duplicatesSkipped: saved.duplicatesSkipped,
      message: 'Job data synced successfully.'
    });

  } catch (error: any) {
    console.error('Apify sync error:', error);
    return NextResponse.json({ success: false, error: 'Apify job sync failed. Please check actor configuration.' }, { status: 500 });
  }
}
