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

    await prisma.emailReply.update({
      where: { id },
      data: {
        classification: 'Unsubscribe',
        aiReplyStatus: 'DoNotReply',
        status: 'Handled'
      }
    });

    // Handle unsubscribe global list and lead status
    await prisma.unsubscribeList.upsert({
      where: { userId_email: { userId: user.id, email: reply.fromEmail } },
      update: {},
      create: { userId: user.id, email: reply.fromEmail, reason: 'Manual Unsubscribe Action' }
    });

    if (reply.leadId) {
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Unsubscribed' }
      });
      
      if (reply.campaignId) {
        await prisma.emailSequence.updateMany({
          where: { leadId: reply.leadId, campaignId: reply.campaignId, status: { in: ['Draft', 'Queued', 'Scheduled'] } },
          data: { status: 'Cancelled', errorMessage: 'Stopped because lead unsubscribed.' }
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Lead unsubscribed successfully.' });
  } catch (error: any) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
