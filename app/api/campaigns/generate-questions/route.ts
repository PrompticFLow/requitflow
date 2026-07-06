import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { generateText } from '@/services/bayofassets';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { targetAudience, industry, offer, goal } = await req.json();

    if (!targetAudience || !industry || !offer || !goal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const prompt = `You are an elite B2B Sales Strategist.
Your task is to generate 3 to 5 highly contextual business questions aimed at the USER (the person running the campaign).
The goal of these questions is to extract deeper insights about their specific business, offer, and strategy so we can craft the perfect outbound email sequence.

Inputs from User:
- Target Audience: ${targetAudience}
- Industry: ${industry}
- Core Offer/Service: ${offer}
- Campaign Goal: ${goal}

Generate 3 to 5 questions you want to ask the user.
Examples:
- "What is your biggest differentiator compared to other agencies?"
- "What is the primary reason SaaS founders churn from your service?"
- "Can you name one specific case study where you helped a recruiter?"

Return your response strictly as valid JSON matching this schema:
{
  "questions": ["Question 1", "Question 2", "Question 3"]
}`;

    const apiKey = process.env.BAYOFASSETS_API_KEY || '';
    const model = 'openai/gpt-4o-mini';
    
    const aiResponse = await generateText(apiKey, prompt, model);

    let jsonStr = aiResponse.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json/g, '');
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.replace(/```/g, '');
    jsonStr = jsonStr.trim();
    
    const startIndex = jsonStr.indexOf('{');
    const endIndex = jsonStr.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error("AI did not return valid JSON");
    }

    const data = JSON.parse(jsonStr.substring(startIndex, endIndex + 1));

    return NextResponse.json({ success: true, questions: data.questions || [] });
  } catch (error: any) {
    console.error('Generate Questions Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate questions. Please try again.',
      details: error.message 
    }, { status: 500 });
  }
}
