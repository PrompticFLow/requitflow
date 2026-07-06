import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
    }

    const existing = await prisma.emailSequence.findFirst({
      where: { id, userId: user.id },
      include: { campaign: true }
    });
    if (!existing) {
      return NextResponse.json({ error: 'Email draft not found.' }, { status: 404 });
    }

    let status = existing.status;
    let scheduledAt = existing.scheduledAt;

    // If campaign is already active, automatically queue it for sending
    if (existing.campaign.status === 'Active' && existing.status !== 'Queued' && existing.status !== 'Sent') {
      status = 'Queued';
      if (existing.sequenceStep === 1) {
        scheduledAt = new Date();
      } else if (!scheduledAt) {
        // Fallback: schedule for next day if no schedule exists
        scheduledAt = new Date();
        scheduledAt.setDate(scheduledAt.getDate() + 1);
      }
    }

    const updated = await prisma.emailSequence.update({
      where: { id: (await params).id },
      data: {
        approvalStatus: "Approved",
        approvedAt: new Date(),
        status,
        scheduledAt
      }
    });

    if (status === 'Queued') {
      // Trigger background send (async)
      const { processDueEmails } = await import('@/lib/email-dispatch');
      processDueEmails({ userId: user.id }).catch(e => console.error("Auto-send failed", e));
    }

    return NextResponse.json({ success: true, email: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
