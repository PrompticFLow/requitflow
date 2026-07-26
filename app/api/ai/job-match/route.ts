import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request) {
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

    const { candidateProfileId, jobId } = await req.json();

    if (!candidateProfileId || !jobId) {
      return NextResponse.json({ error: 'Candidate Profile ID and Job ID are required.' }, { status: 400 });
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId }
    });

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { company: true }
    });

    if (!candidate || !job) {
      return NextResponse.json({ error: 'Candidate or Job not found.' }, { status: 404 });
    }

    const model = process.env.BAYOFASSETS_MODEL || 'google/gemini-2.5-flash';

    const prompt = `You are an expert AI recruiter matching a candidate to a job opening.

Compare the Candidate Profile against the Job Description and determine the match quality.
Score must be between 0 and 100 based on overlapping skills, experience, and role requirements.

Candidate Profile:
Name: ${candidate.firstName} ${candidate.lastName}
Current Title: ${candidate.currentJobTitle || 'N/A'}
Skills: ${candidate.skills}
Experience: ${candidate.yearsOfExperience || 'N/A'}
Education: ${candidate.education}
Summary: ${candidate.profileSummary || 'N/A'}

Job Description:
Title: ${job.title}
Company: ${job.company?.name || 'N/A'}
Description: ${job.description}

Return only valid JSON without markdown wrapping:
{
"matchScore": 0,
"matchingSkills": ["skill 1", "skill 2"],
"missingSkills": ["missing 1", "missing 2"],
"matchReason": "A brief explanation of why this score was given.",
"applicationMessage": "A personalized outreach message (under 100 words) from the candidate to the hiring manager.",
"coverLetter": "A tailored, professional cover letter highlighting why the candidate is a great fit for this specific role."
}`;

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
      return NextResponse.json({ error: 'Failed to analyze match via AI' }, { status: 502 });
    }

    const data = await response.json();
    let aiResult;
    try {
      const content = data.choices[0].message.content.replace(/```json\n?|```\n?/g, '');
      aiResult = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI JSON:', e);
      return NextResponse.json({ error: 'Invalid JSON returned from AI' }, { status: 500 });
    }

    // Record API Usage
    await prisma.aPIUsage.create({
      data: {
        userId: user.id,
        provider: 'Bay of Assets',
        endpoint: '/job-match',
        requestCount: 1,
        tokenUsage: data.usage?.total_tokens || 0
      }
    });

    // Check if analysis exists, if not create or update
    let aiAnalysis = await prisma.aIJobAnalysis.findFirst({
      where: {
        jobId: job.id,
        candidateProfileId: candidate.id
      }
    });

    if (aiAnalysis) {
      aiAnalysis = await prisma.aIJobAnalysis.update({
        where: { id: aiAnalysis.id },
        data: {
          matchScore: aiResult.matchScore || 0,
          matchingSkills: JSON.stringify(aiResult.matchingSkills || []),
          missingSkills: JSON.stringify(aiResult.missingSkills || []),
          matchReason: aiResult.matchReason || '',
          applicationMessage: aiResult.applicationMessage || '',
          coverLetter: aiResult.coverLetter || '',
          model: model,
          status: 'Completed'
        }
      });
    } else {
      aiAnalysis = await prisma.aIJobAnalysis.create({
        data: {
          userId: user.id,
          jobId: job.id,
          candidateProfileId: candidate.id,
          matchScore: aiResult.matchScore || 0,
          matchingSkills: JSON.stringify(aiResult.matchingSkills || []),
          missingSkills: JSON.stringify(aiResult.missingSkills || []),
          matchReason: aiResult.matchReason || '',
          applicationMessage: aiResult.applicationMessage || '',
          coverLetter: aiResult.coverLetter || '',
          model: model,
          status: 'Completed'
        }
      });
    }

    return NextResponse.json({ match: aiAnalysis });

  } catch (error: any) {
    console.error('Job Match Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
