import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { leadId, allSelectedLeads } = await req.json().catch(() => ({}));
    const { id: campaignId } = await params;

    // Verify campaign ownership
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const isActive = campaign.status === 'Active';

    // Scope: one lead, a selected set of leads, or the whole campaign
    const leadFilter = leadId
      ? { leadId }
      : (Array.isArray(allSelectedLeads) && allSelectedLeads.length > 0
        ? { leadId: { in: allSelectedLeads } }
        : {});

    const pendingWhere = { campaignId, userId: user.id, approvalStatus: 'Pending', ...leadFilter };

    const pendingSequences = await prisma.emailSequence.findMany({ where: pendingWhere });

    if (pendingSequences.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No pending emails to approve.' });
    }

    if (isActive) {
      // Campaign already running: Email 1 is due now; follow-ups get no
      // scheduledAt — the dispatch pipeline derives their send time from
      // when the previous step was actually sent (delay respected).
      await prisma.$transaction(
        pendingSequences.map(seq =>
          prisma.emailSequence.update({
            where: { id: seq.id },
            data: {
              approvalStatus: 'Approved',
              approvedAt: new Date(),
              status: 'Queued',
              scheduledAt: seq.sequenceStep === 1 ? new Date() : null,
            },
          })
        )
      );

      // Trigger background send
      const { processDueEmails } = await import('@/lib/email-dispatch');
      processDueEmails({ userId: user.id }).catch(e => console.error('Auto-send failed', e));
    } else {
      await prisma.emailSequence.updateMany({
        where: pendingWhere,
        data: { approvalStatus: 'Approved', approvedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, count: pendingSequences.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
