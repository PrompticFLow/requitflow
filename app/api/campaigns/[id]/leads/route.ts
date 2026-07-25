import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds : [];
    if (leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads specified.' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const [removedSequences, removed] = await prisma.$transaction([
      prisma.emailSequence.deleteMany({ where: { campaignId, leadId: { in: leadIds }, userId: user.id } }),
      prisma.campaignLead.deleteMany({ where: { campaignId, leadId: { in: leadIds } } }),
    ]);

    return NextResponse.json({ success: true, removed: removed.count, removedSequences: removedSequences.count });
  } catch (error: any) {
    console.error('Remove campaign leads error:', error);
    return NextResponse.json({ error: 'Failed to remove leads from the campaign.' }, { status: 500 });
  }
}
