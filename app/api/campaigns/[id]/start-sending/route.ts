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

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: 'Active' }
    });

    // Kick off Email 1 sends immediately; follow-ups are handled in the
    // background by the same processDueEmails pipeline (cron: /api/cron/gmail-sync).
    const { processDueEmails } = await import('@/lib/email-dispatch');
    processDueEmails({ userId: user.id }).catch(console.error);

    return NextResponse.json({ success: true, campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
