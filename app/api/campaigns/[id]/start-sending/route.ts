import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const { checkCampaignReadyToStart } = await import('@/lib/campaign-ready');
    const readyCheck = await checkCampaignReadyToStart(id, user.id);
    
    if (!readyCheck.ready) {
      return NextResponse.json({
        success: false,
        error: "Campaign is not ready to start.",
        missingRequirements: readyCheck.missingRequirements
      }, { status: 400 });
    }

    // Find sequences to schedule (Approved, Step 1, not unsubscribed)
    const sequencesToSchedule = await prisma.emailSequence.findMany({
      where: {
        campaignId: id,
        sequenceStep: 1,
        approvalStatus: 'Approved',
        status: 'Draft',
        lead: { status: { not: "Unsubscribed" } }
      }
    });

    if (sequencesToSchedule.length > 0) {
      await prisma.emailSequence.updateMany({
        where: { id: { in: sequencesToSchedule.map(s => s.id) } },
        data: { status: 'Scheduled' }
      });
    }

    // Revive sequences that were cancelled because of a reply — but only when
    // the lead never actually replied in THIS campaign (e.g. cancelled by the
    // old cross-campaign reply stop). Leads who replied here stay stopped.
    const cancelledByReply = await prisma.emailSequence.findMany({
      where: {
        campaignId: id,
        status: 'Cancelled',
        sentAt: null,
        errorMessage: { contains: 'replied', mode: 'insensitive' }
      },
      select: { id: true, leadId: true }
    });
    if (cancelledByReply.length > 0) {
      const leadIds = Array.from(new Set(cancelledByReply.map(s => s.leadId)));
      const replies = await prisma.emailReply.findMany({
        where: {
          leadId: { in: leadIds },
          OR: [{ campaignId: id }, { campaignId: null }]
        },
        select: { leadId: true }
      });
      const repliedLeadIds = new Set(replies.map(r => r.leadId));
      const reviveIds = cancelledByReply
        .filter(s => !repliedLeadIds.has(s.leadId))
        .map(s => s.id);
      if (reviveIds.length > 0) {
        await prisma.emailSequence.updateMany({
          where: { id: { in: reviveIds } },
          data: { status: 'Queued', errorMessage: null }
        });
      }
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: 'Active' }
    });

    // Kick off Email 1 sends immediately; follow-ups are handled in the
    // background by the same processDueEmails pipeline (cron: /api/cron/send-due-emails).
    const { processDueEmails } = await import('@/lib/email-dispatch');
    processDueEmails({ userId: user.id }).catch(console.error);

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
