import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

const ALLOWED_ACTIONS = ['interested', 'booked', 'unsubscribed', 'handled', 'delete'] as const;
type BulkAction = (typeof ALLOWED_ACTIONS)[number];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
    const action = body.action as BulkAction;

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No reply ids provided' }, { status: 400 });
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const replies = await prisma.emailReply.findMany({
      where: { id: { in: ids }, userId: user.id },
      include: { lead: true },
    });

    if (replies.length === 0) {
      return NextResponse.json({ error: 'No matching replies found' }, { status: 404 });
    }

    const ownedIds = replies.map((r) => r.id);

    if (action === 'delete') {
      await prisma.emailReply.deleteMany({
        where: { id: { in: ownedIds }, userId: user.id },
      });
      return NextResponse.json({ success: true, count: ownedIds.length });
    }

    for (const reply of replies) {
      if (action === 'interested') {
        if (reply.leadId) {
          await prisma.lead.update({
            where: { id: reply.leadId },
            data: { status: 'Interested' },
          });
        }
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { status: 'Handled' },
        });
      } else if (action === 'unsubscribed') {
        if (reply.leadId) {
          await prisma.lead.update({
            where: { id: reply.leadId },
            data: { status: 'Unsubscribed' },
          });
        }
        if (reply.lead?.email) {
          await prisma.unsubscribeList.upsert({
            where: { userId_email: { userId: user.id, email: reply.lead.email } },
            update: { reason: 'Manual unsubscribe from Inbox' },
            create: { userId: user.id, email: reply.lead.email, reason: 'Manual unsubscribe from Inbox' },
          });
        }
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { status: 'Handled' },
        });
      } else if (action === 'handled') {
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { status: 'Handled' },
        });
      } else if (action === 'booked') {
        if (reply.leadId) {
          await prisma.lead.update({
            where: { id: reply.leadId },
            data: { status: 'Call Booked' },
          });
        }
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { status: 'Handled', bookedCall: true },
        });
      }
    }

    return NextResponse.json({ success: true, count: ownedIds.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
