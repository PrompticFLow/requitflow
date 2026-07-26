import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    
    const reply = await prisma.emailReply.findUnique({
      where: { id },
      include: { lead: true }
    });

    if (!reply || reply.userId !== user.id) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    // Mark as booked
    await prisma.emailReply.update({
      where: { id },
      data: {
        bookedCall: true,
        status: 'Handled',
        aiReplyStatus: 'DoNotReply'
      }
    });

    // Stop emails and update lead
    if (reply.leadId) {
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Booked' }
      });
      
      if (reply.campaignId) {
        await prisma.emailSequence.updateMany({
          where: { leadId: reply.leadId, campaignId: reply.campaignId, status: { in: ['Draft', 'Queued', 'Scheduled'] } },
          data: { status: 'Cancelled', errorMessage: 'Stopped because lead booked a call.' }
        });
        await prisma.campaignLead.updateMany({
          where: { campaignId: reply.campaignId, leadId: reply.leadId },
          data: { status: 'Booked' },
        });
      }

      const existingCall = await prisma.bookedCall.findFirst({
        where: { userId: user.id, leadId: reply.leadId, status: { in: ['Scheduled', 'Confirmed', 'Booked'] } },
      });
      if (!existingCall) {
        await prisma.bookedCall.create({
          data: {
            userId: user.id,
            leadId: reply.leadId,
            campaignId: reply.campaignId,
            callDate: new Date(),
            status: 'Booked',
            notes: 'Marked booked from replies inbox',
          },
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Marked as booked.' });
  } catch (error: any) {
    console.error('Mark booked error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
