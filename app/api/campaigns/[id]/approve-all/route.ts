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

    // Find all pending sequences first to know what to update
    const pendingSequences = await prisma.emailSequence.findMany({
      where: { campaignId, approvalStatus: "Pending" }
    });

    if (pendingSequences.length > 0) {
      if (isActive) {
        // If active, we need to update them to Queued and set scheduledAt (at least for step 1)
        // We'll just do it in a transaction
        await prisma.$transaction(
          pendingSequences.map(seq => {
            let scheduledAt = seq.scheduledAt;
            if (seq.sequenceStep === 1) scheduledAt = new Date();
            
            return prisma.emailSequence.update({
              where: { id: seq.id },
              data: {
                approvalStatus: "Approved",
                status: "Queued",
                scheduledAt: scheduledAt || new Date()
              }
            });
          })
        );
        
        // Trigger background send
        const { processDueEmails } = await import('@/lib/email-dispatch');
        processDueEmails({ userId: user.id }).catch(e => console.error("Auto-send failed", e));
      } else {
        await prisma.emailSequence.updateMany({
          where: { campaignId, approvalStatus: "Pending" },
          data: {
            approvalStatus: "Approved"
          }
        });
      }
    }

    let whereClause: any = { campaignId, userId: user.id };
    
    if (leadId) {
      // Approve all for a specific lead
      whereClause.leadId = leadId;
    } else if (allSelectedLeads && Array.isArray(allSelectedLeads)) {
      // Approve all for specific selected leads
      whereClause.leadId = { in: allSelectedLeads };
    }

    const updated = await prisma.emailSequence.updateMany({
      where: whereClause,
      data: {
        approvalStatus: "Approved",
        approvedAt: new Date()
      }
    });

    return NextResponse.json({ success: true, count: updated.count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
