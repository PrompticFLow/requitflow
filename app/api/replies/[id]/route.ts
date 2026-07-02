import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action } = await req.json();

    const { id } = await params;

    const reply = await prisma.emailReply.findUnique({
      where: { id },
      include: { lead: true }
    });

    if (!reply || !reply.lead || reply.lead.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (action === 'interested') {
      if (!reply.leadId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Interested' }
      });
      await prisma.emailReply.update({
        where: { id },
        data: { status: 'Handled' }
      });
    } else if (action === 'unsubscribed') {
      if (!reply.leadId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Unsubscribed' }
      });
      if (reply.lead.email) {
        await prisma.unsubscribeList.upsert({
          where: { userId_email: { userId: user.id, email: reply.lead.email } },
          update: { reason: "Manual unsubscribe from Inbox" },
          create: { userId: user.id, email: reply.lead.email, reason: "Manual unsubscribe from Inbox" }
        });
      }
      await prisma.emailReply.update({
        where: { id },
        data: { status: 'Handled' }
      });
    } else if (action === 'handled') {
      await prisma.emailReply.update({
        where: { id },
        data: { status: 'Handled' }
      });
    } else if (action === 'booked') {
      if (!reply.leadId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Call Booked' }
      });
      await prisma.emailReply.update({
        where: { id },
        data: { status: 'Handled', bookedCall: true }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
