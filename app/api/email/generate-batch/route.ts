import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { generateText } from '@/services/bayofassets';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let bayOfAssetsKey: string;
  try {
    bayOfAssetsKey = await resolveUserApiKey(user.id, 'bayofassets');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });

  try {
    // 1. Ensure there is a default campaign for testing
    let campaign = await prisma.campaign.findFirst({
      where: { userId: user.id }
    });

    if (!campaign) {
      campaign = await prisma.campaign.create({
        data: {
          userId: user.id,
          name: "Launch Outreach",
          goal: "Book a 15-minute discovery call to discuss our hiring software.",
          status: "Active"
        }
      });
    }

    // 2. Find leads that don't have any email sequences yet (limit to 3 for testing to avoid Vercel timeouts)
    const leadsWithoutEmails = await prisma.lead.findMany({
      where: {
        userId: user.id,
        emailSequences: { none: {} } // Has no email sequences
      },
      take: 3
    });

    if (leadsWithoutEmails.length === 0) {
      return NextResponse.json({ message: "No new leads need emails right now.", generatedCount: 0 });
    }

    // 3. Link them to the campaign if they aren't already
    for (const lead of leadsWithoutEmails) {
      if (!lead.campaignId) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { campaignId: campaign.id }
        });
      }
    }

    // 4. Generate emails via OpenRouter
    let generatedCount = 0;
    
    // We do them sequentially to not overload the API limit
    for (const lead of leadsWithoutEmails) {
      const prompt = `You are an expert B2B cold email copywriter. Create a personalized email sequence for this lead. 
The goal is: ${campaign.goal}. 
Lead details:
Name: ${lead.businessName}
Location: ${lead.location || lead.address || 'Unknown'}
Category: ${lead.category || 'Business'}

Keep it short, human, and professional. Output exactly 3 steps in JSON array format: [{ "subject": "...", "body": "..." }]`;

      const rawResponse = await generateText(bayOfAssetsKey, prompt, settings?.bayOfAssetsModel || 'openai/gpt-4o-mini');
      
      const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const sequences = JSON.parse(jsonMatch[0]);
          for (let i = 0; i < sequences.length; i++) {
            await prisma.emailSequence.create({
              data: {
                userId: user.id,
                campaignId: campaign.id,
                leadId: lead.id,
                sequenceStep: i + 1,
                subject: sequences[i].subject || 'No Subject',
                body: sequences[i].body || 'No Body',
                status: "Draft",
              }
            });
            generatedCount++;
          }
          
          // Update lead status
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "Email Generated" }
          });
          
        } catch (e) {
          console.error("Failed to parse AI output for lead:", lead.id);
        }
      }
    }

    return NextResponse.json({ 
      message: `Generated ${generatedCount} emails for ${leadsWithoutEmails.length} leads.`, 
      generatedCount 
    });

  } catch (error: any) {
    console.error('Batch generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
