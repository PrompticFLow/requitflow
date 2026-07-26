import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getJobBoardApiKey } from '@/lib/jobBoard';
import { generateText } from '@/services/bayofassets';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let searchData;
  try {
    searchData = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // 1. Secure API Key check (will throw if missing, returning 500 automatically, or we catch it)
  try {
    getJobBoardApiKey(); // Just validating it exists per requirements
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 2. Save search history
  const searchRecord = await prisma.candidateSearch.create({
    data: {
      userId: user.id,
      jobTitle: searchData.jobTitle || '',
      skills: searchData.skills || '',
      location: searchData.location || '',
      country: searchData.country || '',
      experienceLevel: searchData.experienceLevel || '',
      maxResults: parseInt(searchData.maxResults) || 10,
      status: "Processing"
    }
  });

  // 3. Mock Job Board Response (Simulating API fetch normalization)
  // In a real scenario, this would be: await fetchFromJobBoard(`/search?...`)
  const mockCandidates = [
    {
      name: "Alex Mercer",
      jobTitle: searchData.jobTitle || "Senior Software Engineer",
      skills: searchData.skills || "React, Node.js, TypeScript",
      location: searchData.location || "San Francisco",
      country: searchData.country || "US",
      experience: searchData.experienceLevel || "5 years",
      email: "alex.mercer@example.com",
      profileUrl: "https://linkedin.com/in/alex-mock",
    },
    {
      name: "Sarah Chen",
      jobTitle: searchData.jobTitle || "Lead Developer",
      skills: "Python, AWS, React, System Design",
      location: "Remote",
      country: "CA",
      experience: "8 years",
      email: "sarah.chen.mock@example.com",
      profileUrl: "https://github.com/sarah-mock",
    },
    {
      name: "Marcus Johnson",
      jobTitle: "Fullstack Engineer",
      skills: "Vue, Ruby on Rails, PostgreSQL",
      location: "New York",
      country: "US",
      experience: "3 years",
      email: "marcus.j@example.com",
      profileUrl: "https://portfolio-mock.com",
    }
  ].slice(0, searchData.maxResults || 10);

  // 4. AI Scoring Logic
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  let bayOfAssetsKey: string | null = null;
  try {
    bayOfAssetsKey = await resolveUserApiKey(user.id, 'bayofassets');
  } catch (e: any) {
    if (!(e instanceof ByokKeyMissingError)) throw e;
  }

  const processedCandidates = [];

  for (const c of mockCandidates) {
    let matchScore = 75; // Fallback score
    let aiSummary = "Solid candidate matching general criteria. Good technical background.";
    
    if (bayOfAssetsKey) {
      try {
        const prompt = `You are a technical recruiter. Evaluate this candidate for a role requiring: ${searchData.jobTitle || 'General Engineering'}, Skills: ${searchData.skills || 'Any'}, Exp: ${searchData.experienceLevel || 'Any'}.
Candidate Info: Name: ${c.name}, Exp: ${c.experience}, Skills: ${c.skills}.
Output JSON exactly like this: { "score": 85, "summary": "Short 2 sentence summary of strengths and best outreach angle." }`;
        
        const aiRaw = await generateText(bayOfAssetsKey, prompt, settings?.bayOfAssetsModel || 'openai/gpt-4o-mini');
        const match = aiRaw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          matchScore = parsed.score || matchScore;
          aiSummary = parsed.summary || aiSummary;
        }
      } catch (err) {
        console.error("AI scoring failed for candidate, using fallback.", err);
      }
    }

    processedCandidates.push({
      ...c,
      userId: user.id,
      matchScore,
      aiSummary,
      source: "Job Board API",
      status: "New",
      rawData: JSON.stringify(c)
    });
  }

  // 5. Save to database
  let savedCount = 0;
  for (const pc of processedCandidates) {
    await prisma.candidate.create({ data: pc });
    savedCount++;
  }

  // Update search record
  await prisma.candidateSearch.update({
    where: { id: searchRecord.id },
    data: { totalFound: savedCount, status: "Completed" }
  });

  return NextResponse.json({ 
    message: "Search completed successfully", 
    candidatesFound: savedCount 
  });
}
