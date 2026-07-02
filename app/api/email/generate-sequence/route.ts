import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { decrypt } from '@/lib/encryption';
import { generateText } from '@/services/openrouter';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    return NextResponse.json({ error: 'OpenRouter key missing in environment variables' }, { status: 400 });
  }
  
  const { campaignId, leadId } = await req.json();

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });

  if (!campaign || !lead) return NextResponse.json({ error: 'Campaign or Lead not found' }, { status: 404 });

  const prompt = `You are an expert B2B outbound sales copywriter. Create a personalized email sequence for this lead.
The goal is: ${campaign.goal}. 
Lead details:
Name: ${(lead as any).businessName}
Location: ${(lead as any).location}
Category: ${(lead as any).category}
AI Insight: ${(lead as any).aiInsight}
Sender info: ${settings?.smtpFromName || 'Sales Team'} from ${(user as any).companyName || 'our company'}.
Booking link: ${settings?.bookingLink || ''}

Keep it short, human, and professional. Output exactly 3 steps in JSON array format: [{ "subject": "...", "body": "..." }]`;

  try {
    const rawResponse = await generateText(openrouterKey, prompt, settings?.openrouterModel || 'openai/gpt-4o-mini');
    
    // Naive JSON parsing of AI output
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
    
    const sequences = JSON.parse(jsonMatch[0]);

    const createdSequences = [];
    for (let i = 0; i < sequences.length; i++) {
      const seq = await prisma.emailSequence.create({
        data: {
          userId: user.id,
          campaignId: campaign.id,
          leadId: lead.id,
          sequenceStep: i + 1,
          subject: sequences[i].subject,
          body: sequences[i].body,
          status: "Draft",
        }
      });
      createdSequences.push(seq);
    }

    return NextResponse.json({ sequences: createdSequences });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
