import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateText } from '@/services/bayofassets';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { targetAudience, industry, offer, goal, answers } = await req.json();

    if (!targetAudience || !industry || !offer || !goal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prompt = `You are an elite B2B Sales Strategist and AI Outbound Specialist.
Your task is to analyze the target audience, the offer, and the user's specific answers to business questions, and generate a dynamic outbound campaign strategy.

Inputs:
- Target Audience: ${targetAudience}
- Industry: ${industry}
- Core Offer/Service: ${offer}
- Campaign Goal: ${goal}
- User's Deep Context (Q&A):
${answers ? answers.map((a: any, i: number) => `Q: ${a.question}\nA: ${a.answer}`).join('\n') : 'No deeper context provided.'}

Generate exactly 3 to 7 highly contextual discovery questions TO ASK THE PROSPECT IN EMAILS.
Rules for prospect questions:
- Must be highly relevant to this specific target audience.
- Must avoid generic questions.
- Focus on pain points and conversion triggers.
- Example for SaaS founders: "What problem does your SaaS solve today?"

Also, generate a campaign title, the overarching messaging angle (based on the Q&A), the recommended email tone, and 3-5 expected pain points.

Return your response strictly as valid JSON matching this exact schema:
{
  "campaignTitle": "A short, descriptive name for this campaign",
  "targetAudience": "The refined target audience",
  "generatedQuestions": ["Question to ask prospect 1", "Question to ask prospect 2"],
  "messagingAngle": "A 1-2 sentence description of the overarching strategy",
  "recommendedEmailTone": "e.g. Professional, Friendly, Direct & Concise",
  "expectedPainPoints": ["Pain point 1", "Pain point 2"]
}`;

    // Always use a strong model for JSON extraction/strategy
    const apiKey = process.env.BAYOFASSETS_API_KEY || '';
    const model = 'openai/gpt-4o-mini';
    
    const aiResponse = await generateText(apiKey, prompt, model);

    // Parse JSON
    let jsonStr = aiResponse.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json/g, '');
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.replace(/```/g, '');
    jsonStr = jsonStr.trim();
    
    const startIndex = jsonStr.indexOf('{');
    const endIndex = jsonStr.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error("AI did not return valid JSON");
    }

    const strategy = JSON.parse(jsonStr.substring(startIndex, endIndex + 1));

    return NextResponse.json({ success: true, strategy });
  } catch (error: any) {
    console.error('Strategy Builder Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate campaign strategy. Please try again.',
      details: error.message 
    }, { status: 500 });
  }
}
