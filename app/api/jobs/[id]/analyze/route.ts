import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let bayOfAssetsKey: string;
    try {
      bayOfAssetsKey = await resolveUserApiKey(user.id, 'bayofassets');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: { company: true }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const model = process.env.BAYOFASSETS_MODEL || 'google/gemini-2.5-flash';

    const prompt = `You are an expert recruitment researcher and job-listing analyst.

Analyze the supplied job listing using only the information provided.

Do not invent company information, salary, recruiter details, experience requirements, skills, vacancies, candidates needed, work mode, or hiring claims.

A vacancy count may be returned only when the supplied job description explicitly states a number of openings, vacancies, candidates, hires, or positions.

Do not treat the number of advertisements as the number of candidates required.

If information is unavailable, use null, an empty array, or 'Not disclosed' as appropriate.

Job Title:
${job.title}

Company:
${job.company?.name || 'Not disclosed'}

Location:
${job.location || 'Not disclosed'}

Category:
${job.category || 'Not disclosed'}

Job Description:
${job.description || 'Not disclosed'}

Return only valid JSON without markdown wrapping:
{
"summary": "",
"requiredSkills": [],
"preferredSkills": [],
"requiredExperience": null,
"workMode": "Remote | Hybrid | On-site | Not disclosed",
"jobType": null,
"vacancies": null,
"candidatesNeeded": null,
"vacancyStatus": "Publicly disclosed | Not publicly disclosed",
"vacancyEvidence": "",
"hiringUrgency": "Low | Medium | High",
"hiringDemand": "Low | Medium | High"
}

Rules:
* Return only valid JSON.
* Never wrap JSON in markdown.
* Never invent missing information.
* Vacancy evidence must quote or briefly identify the exact source phrase.
* If no vacancy number is explicitly stated, vacancies and candidatesNeeded must be null.
* If the description says "Multiple openings", "Multiple positions", etc. but gives no exact number, vacancies and candidatesNeeded must be null, vacancyStatus must be "Publicly disclosed", and vacancyEvidence must state "The listing states that multiple openings are available, but no exact count is provided."
* If work mode is unclear, return 'Not disclosed'.`;

    const response = await fetch(`${process.env.BAYOFASSETS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bayOfAssetsKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      console.error(`Bay of Assets API Error: ${response.statusText}`);
      return NextResponse.json({ error: 'Failed to analyze job via AI' }, { status: 502 });
    }

    const data = await response.json();
    let aiResult;
    try {
      const content = data.choices[0].message.content;
      // remove possible markdown formatting
      const cleanContent = content.replace(/```json\n?|```\n?/g, '');
      aiResult = JSON.parse(cleanContent);
    } catch (e) {
      console.error('Failed to parse AI JSON:', e);
      return NextResponse.json({ error: 'Invalid JSON returned from AI' }, { status: 500 });
    }

    // Record API Usage
    await prisma.aPIUsage.create({
      data: {
        userId: user.id,
        provider: 'Bay of Assets',
        endpoint: '/chat/completions',
        requestCount: 1,
        tokenUsage: data.usage?.total_tokens || 0
      }
    });

    const aiAnalysis = await prisma.aIJobAnalysis.create({
      data: {
        userId: user.id,
        jobId: job.id,
        summary: aiResult.summary || '',
        requiredSkills: JSON.stringify(aiResult.requiredSkills || []),
        preferredSkills: JSON.stringify(aiResult.preferredSkills || []),
        requiredExperience: aiResult.requiredExperience ? String(aiResult.requiredExperience) : null,
        workMode: aiResult.workMode || null,
        jobType: aiResult.jobType || null,
        vacancies: aiResult.vacancies ? parseInt(aiResult.vacancies) : null,
        candidatesNeeded: aiResult.candidatesNeeded ? parseInt(aiResult.candidatesNeeded) : null,
        vacancyStatus: aiResult.vacancyStatus || 'Not publicly disclosed',
        vacancyEvidence: aiResult.vacancyEvidence || '',
        hiringUrgency: aiResult.hiringUrgency || 'Medium',
        hiringDemand: aiResult.hiringDemand || 'Medium',
        model: model,
        status: 'Completed'
      }
    });

    // Optionally update the job with the AI Summary directly for quick access
    await prisma.job.update({
      where: { id: job.id },
      data: {
        aiSummary: aiResult.summary || '',
        hiringUrgency: aiResult.hiringUrgency || 'Medium',
        vacancies: aiResult.vacancies ? parseInt(aiResult.vacancies) : null,
      }
    });

    return NextResponse.json({ aiAnalysis });

  } catch (error: any) {
    console.error('Analyze Job Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
