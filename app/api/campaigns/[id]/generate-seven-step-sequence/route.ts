import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateSevenStepSequence } from '@/lib/campaign-generator';
import { recommendNextSendTime } from '@/lib/scheduling';
import { calculateBestSendTime } from '@/lib/email/best-send-time';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { leadIds } = await req.json(); // Accept array of leadIds for batching
    
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
    }

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { 
        user: { include: { settings: true } },
        knowledgeBaseFiles: true 
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    let bayOfAssetsKey: string;
    try {
      bayOfAssetsKey = await resolveUserApiKey(campaign.userId, 'bayofassets');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    // Process in batches of 10
    const results = [];
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE);
      
      const leads = await prisma.lead.findMany({
        where: { id: { in: batch }, campaignId: campaign.id }
      });

      for (const lead of leads) {
        try {
          // Check if sequence already exists
          const existing = await prisma.emailSequence.count({
            where: { leadId: lead.id, campaignId: campaign.id }
          });
          
          if (existing >= 7) {
            results.push({ leadId: lead.id, status: 'skipped', reason: 'Sequence already exists' });
            continue;
          }

          // Use actual KB files instead of mocking
          const kbFiles = campaign.knowledgeBaseFiles || []; 

          const sequence = await generateSevenStepSequence(
            bayOfAssetsKey,
            'openai/gpt-4o-mini',
            campaign,
            lead,
            kbFiles
          );

          let baseDate = new Date();
          
          for (const step of sequence) {
            let scheduledAt: Date;
            let reason: string;
            let scheduledTimezone: string | undefined;
            let bestSendReason: string | undefined;
            let sendWindow: string | undefined;

            if (campaign.useAiBestTime) {
              const bestTime = calculateBestSendTime({
                leadLocation: lead.location || lead.country,
                campaignLocation: campaign.location || campaign.country,
                targetAudience: campaign.targetAudience,
                stepNumber: step.step,
                delayDays: step.delayAmount,
                lastEmailSentAt: baseDate
              });
              scheduledAt = bestTime.sendAt;
              scheduledTimezone = bestTime.timezone;
              bestSendReason = bestTime.reason;
              sendWindow = bestTime.sendWindow;
              reason = bestTime.reason;
            } else {
              // Calculate recommended timing fallback
              const result = recommendNextSendTime(
                baseDate,
                step.delayAmount,
                step.delayUnit,
                campaign.timezoneMode,
                campaign.allowedSendingDays ? JSON.parse(campaign.allowedSendingDays) : ['Mon','Tue','Wed','Thu','Fri'],
                campaign.sendingWindowStart || '09:00',
                campaign.sendingWindowEnd || '16:00',
                campaign.skipHolidays
              );
              scheduledAt = result.scheduledAt;
              reason = result.reason;
            }

            await prisma.emailSequence.create({
              data: {
                userId: campaign.userId,
                campaignId: campaign.id,
                leadId: lead.id,
                sequenceStep: step.step,
                name: step.name,
                subject: step.subject,
                previewText: step.previewText,
                body: step.body,
                ctaText: step.ctaText,
                ctaLink: step.ctaLink,
                delayAmount: step.delayAmount,
                delayUnit: step.delayUnit,
                recommendedSendAt: scheduledAt,
                scheduledAt: scheduledAt,
                scheduledTimezone: scheduledTimezone,
                timingReason: reason,
                bestSendReason: bestSendReason,
                sendWindow: sendWindow,
                knowledgeBaseSources: JSON.stringify(step.knowledgeBaseSources || []),
                personalizationReason: step.personalizationReason,
                status: 'Draft',
                approvalStatus: campaign.autoApproveEmails ? 'Approved' : 'Pending'
              }
            });
            
            baseDate = scheduledAt; // Next step calculates from this step's date
          }

          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: 'Email Generated' }
          });

          results.push({ leadId: lead.id, status: 'success' });
        } catch (err: any) {
          console.error(`Failed generating sequence for lead ${lead.id}`, err);
          results.push({ leadId: lead.id, status: 'error', reason: err.message });
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Sequence Generation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
