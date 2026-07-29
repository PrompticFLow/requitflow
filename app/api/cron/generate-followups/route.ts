import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateNextEmail } from '@/lib/ai/generate-next-email';

export const maxDuration = 300; // Vercel timeout max

const DELAYS_BY_STEP: Record<number, number> = {
  1: 3, // Email 1 to 2 -> 3 days
  2: 4, // Email 2 to 3 -> 4 days
  3: 5,
  4: 7,
  5: 10,
  6: 14
};

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find all leads where the campaign is active and they haven't met stop conditions
    const activeLeads = await prisma.campaignLead.findMany({
      where: {
        status: 'Active',
        campaign: { status: 'Active' },
        lead: {
          // 'Replied' is intentionally not filtered here: a reply only stops
          // follow-ups in the campaign it happened in (checked per-campaign below).
          status: { notIn: ['Booked', 'Not Interested', 'Bounced', 'Unsubscribed'] }
        }
      },
      include: {
        lead: true,
        campaign: true
      }
    });

    let generatedCount = 0;
    let failedCount = 0;

    for (const cl of activeLeads) {
      // Safety: Check if user unsubscribed globally
      const isUnsub = await prisma.unsubscribeList.findUnique({
        where: { userId_email: { userId: cl.campaign.userId, email: cl.lead.email || '' } }
      });
      if (isUnsub) {
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { status: 'Unsubscribed' }
        });
        continue;
      }

      // A reply stops follow-up generation only in the campaign it was received in
      const repliedInCampaign = await prisma.emailReply.findFirst({
        where: {
          leadId: cl.leadId,
          OR: [{ campaignId: cl.campaignId }, { campaignId: null }]
        },
        select: { id: true }
      });
      if (repliedInCampaign) {
        continue;
      }

      // Find the latest email for this lead in this campaign
      const latestEmail = await prisma.emailSequence.findFirst({
        where: { campaignId: cl.campaignId, leadId: cl.leadId },
        orderBy: { sequenceStep: 'desc' }
      });

      if (!latestEmail) {
        continue; // Handled by initial generation
      }

      // If the latest email isn't Sent (e.g. Queued, Draft, Failed), do not generate the next one
      if (latestEmail.status !== 'Sent' || !latestEmail.sentAt) {
        continue;
      }

      const currentStep = latestEmail.sequenceStep;
      if (currentStep >= 7) {
        continue; // Sequence complete
      }

      const delayDays = DELAYS_BY_STEP[currentStep] || 3;
      const targetDate = new Date(latestEmail.sentAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now >= targetDate) {
        // Due for the next email! Generate it.
        try {
          const targetStep = currentStep + 1;
          
          // Determine if we have a KB summary
          let kbResult = { hasKnowledge: false, context: '', summaries: [] as string[], fileCount: 0 };
          const kbFiles = await prisma.knowledgeBaseFile.findMany({
            where: { campaignId: cl.campaignId, status: 'Ready' }
          });
          if (kbFiles.length > 0) {
            kbResult = {
              hasKnowledge: true,
              context: kbFiles.map(f => f.extractedText || '').join('\n\n').substring(0, 300000),
              summaries: kbFiles.map(f => f.summary || ''),
              fileCount: kbFiles.length
            };
          }

          const generated = await generateNextEmail({
            userId: cl.campaign.userId,
            campaignId: cl.campaignId,
            leadId: cl.leadId,
            targetStep,
            kbResult
          });

          // Save the generated email as Queued and Approved so process-due can send it immediately
          await prisma.emailSequence.create({
            data: {
              userId: cl.campaign.userId,
              campaignId: cl.campaignId,
              leadId: cl.leadId,
              name: `Email ${targetStep}`,
              subject: generated.subject,
              body: generated.body,
              sequenceStep: targetStep,
              status: 'Queued',
              approvalStatus: 'Approved',
              scheduledAt: new Date(),
              ctaText: '',
              ctaLink: cl.campaign.bookingLink || cl.campaign.ctaLink || '',
              aiOriginalSubject: generated.aiOriginalSubject,
              aiOriginalBody: generated.aiOriginalBody,
              aiGenerationReason: generated.personalizationReason,
              spamRisk: generated.spamRisk,
              spamIssues: generated.spamIssues,
              delayAmount: delayDays,
              delayUnit: 'days'
            }
          });

          generatedCount++;

        } catch (error: any) {
          console.error(`Failed to generate follow-up for Lead ${cl.leadId}:`, error.message);
          failedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, generated: generatedCount, failed: failedCount });

  } catch (error: any) {
    console.error('Generate follow-ups cron error:', error);
    return NextResponse.json({ error: 'Failed to generate follow-ups' }, { status: 500 });
  }
}
