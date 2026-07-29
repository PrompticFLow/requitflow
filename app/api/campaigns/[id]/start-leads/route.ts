import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// Starts (or restarts) the email sequence for specific leads in a campaign:
// their approved, unsent emails are queued and picked up by the dispatcher.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { leadIds } = await req.json();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one lead to start.' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id, userId: user.id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    // Queue every approved, unsent email for the selected leads — including
    // ones previously Cancelled/Stopped/Failed, so a stopped lead can be resumed.
    const sequences = await prisma.emailSequence.findMany({
      where: {
        campaignId: id,
        leadId: { in: leadIds },
        approvalStatus: 'Approved',
        sentAt: null,
        status: { in: ['Draft', 'Scheduled', 'Cancelled', 'Stopped', 'Failed', 'Pending'] }
      },
      select: { id: true, leadId: true }
    });

    if (sequences.length > 0) {
      // manualStart: the user explicitly started these — soft safeguards
      // (replied / booked / lead-status stops) are bypassed for them. Hard
      // compliance stops (unsubscribe, bounce, spam) still apply.
      await prisma.emailSequence.updateMany({
        where: { id: { in: sequences.map(s => s.id) } },
        data: { status: 'Queued', errorMessage: null, manualStart: true }
      });
    }

    // Sending only happens while the campaign is Active
    let campaignActivated = false;
    if (campaign.status !== 'Active' && sequences.length > 0) {
      await prisma.campaign.update({
        where: { id },
        data: { status: 'Active', startedAt: campaign.startedAt || new Date() }
      });
      campaignActivated = true;
    }

    if (sequences.length > 0) {
      const { processDueEmails } = await import('@/lib/email-dispatch');
      processDueEmails({ userId: user.id }).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      requeued: sequences.length,
      leadsStarted: new Set(sequences.map(s => s.leadId)).size,
      campaignActivated
    });
  } catch (error: any) {
    console.error('Start-leads error:', error);
    return NextResponse.json({ error: error.message || 'Failed to start sequences for the selected leads.' }, { status: 500 });
  }
}
