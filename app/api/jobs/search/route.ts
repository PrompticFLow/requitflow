import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateText } from '@/services/openrouter';
import { runApifyActor } from '@/lib/hiring/apify';
import { normalizeApifyJob } from '@/lib/hiring/normalization';

// Increase max duration to allow Apify actors to finish
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      country, 
      jobTitle, 
      category, 
      location, 
      page = 1, 
      resultsPerPage = 25,
      jobType,
      salaryMin,
      salaryMax,
      datePosted
    } = body;

    const token = process.env.APIFY_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Apify API token is not configured.' }, { status: 500 });
    }

    // Determine default source. Using linkedin as fallback if not specified
    const source = 'linkedin';
    let rawJobs = [];
    let normalizedJobs = [];

    // Run Apify Actor
    try {
      rawJobs = await runApifyActor(source, jobTitle || '', location || '', country || '', resultsPerPage);
      normalizedJobs = rawJobs.map((j: any) => normalizeApifyJob(j, source)).filter(j => j.title !== 'Unknown Title');
    } catch (apifyError: any) {
      console.error("Apify search failed:", apifyError);
      return NextResponse.json({ error: apifyError.message || 'Job search via Apify failed.' }, { status: 500 });
    }

    // Save history
    await prisma.jobSearchHistory.create({
      data: {
        userId: user.id,
        searchFilters: JSON.stringify(body),
        countryCode: country || 'US',
        totalResults: normalizedJobs.length,
      }
    });

    const finalJobs = [];
    
    // Process jobs, save to DB
    for (const job of normalizedJobs) {
      if (!job.applyUrl) continue;
      
      // Upsert company
      let company = null;
      if (job.companyName) {
        company = await prisma.company.findFirst({
          where: { name: job.companyName }
        });
        
        if (!company) {
          company = await prisma.company.create({
            data: {
              name: job.companyName,
              country: job.country,
              location: job.location,
              activeJobPostCount: 1,
              latestPostingDate: job.postedAt
            }
          });
        } else {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              activeJobPostCount: { increment: 1 },
              latestPostingDate: (job.postedAt && (!company.latestPostingDate || job.postedAt > company.latestPostingDate)) ? job.postedAt : company.latestPostingDate
            }
          });
        }
      }

      // Check DB duplicate
      const existingJob = await prisma.job.findFirst({
        where: {
          OR: [
            job.sourceJobId ? { externalId: job.sourceJobId } : { id: 'impossible-id' },
            { applicationUrl: job.applyUrl },
            company ? {
              companyId: company.id,
              title: job.title,
              location: job.location,
            } : { id: 'impossible-id' }
          ]
        }
      });

      let savedJob;
      if (existingJob) {
        savedJob = await prisma.job.update({
          where: { id: existingJob.id },
          data: {
            lastSeenAt: new Date(),
          }
        });
      } else {
        const workModeMap: Record<string, string> = {
          'REMOTE': 'Remote',
          'HYBRID': 'Hybrid',
          'ONSITE': 'On-site'
        };

        savedJob = await prisma.job.create({
          data: {
             externalId: job.sourceJobId,
             companyId: company ? company.id : null,
             source: job.source,
             title: job.title,
             category: job.category,
             description: job.description,
             location: job.location,
             city: job.city,
             country: job.country,
             workMode: workModeMap[job.remoteType] || 'Unknown',
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
      }
      
      finalJobs.push({
        ...savedJob,
        company: company || { name: job.companyName || 'Unknown' }
      });
    }
    
    // AI Analysis (limited to top 3 to prevent timeouts)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey && finalJobs.length > 0) {
       await Promise.all(finalJobs.slice(0, 3).map(async (job) => {
          try {
             if (job.description && !job.aiSummary) {
               const prompt = `Analyze this job posting:
Title: ${job.title}
Desc: ${job.description.substring(0, 1000)}

Please return a concise 2-sentence summary of the role and any core skills.`;
               const aiSummary = await generateText(openRouterKey, prompt, process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash');
               job.aiSummary = aiSummary;
               await prisma.job.update({
                  where: { id: job.id },
                  data: { aiSummary }
               });
             }
          } catch(e) {
             console.error("AI Analysis failed for job", job.id, e);
          }
       }));
    }

    return NextResponse.json({
      items: finalJobs,
      provider: 'Apify',
      page,
      pageSize: resultsPerPage,
      totalResults: normalizedJobs.length,
      totalPages: Math.ceil(normalizedJobs.length / resultsPerPage)
    });

  } catch (error: any) {
    console.error('Job Search Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
