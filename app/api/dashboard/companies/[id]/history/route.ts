import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

type HistoryItem = {
  type: 'email' | 'reply' | 'meeting' | 'created';
  label: string;
  at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const lead = await prisma.lead.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        createdAt: true,
        emailSequences: {
          where: { status: 'Sent' },
          orderBy: { sentAt: 'desc' },
          take: 10,
          select: { sequenceStep: true, subject: true, sentAt: true },
        },
        emailReplies: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { intent: true, classification: true, subject: true, createdAt: true },
        },
        bookedCalls: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { callDate: true, status: true, createdAt: true },
        },
      },
    });

    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const history: HistoryItem[] = [];

    for (const call of lead.bookedCalls) {
      history.push({
        type: 'meeting',
        label:
          call.status === 'Canceled' || call.status === 'Cancelled'
            ? 'Meeting canceled'
            : 'Call booked',
        at: (call.callDate || call.createdAt).toISOString(),
      });
    }
    for (const reply of lead.emailReplies) {
      const intent = reply.intent || reply.classification;
      history.push({
        type: 'reply',
        label: intent ? `Replied — ${intent}` : 'Reply received',
        at: reply.createdAt.toISOString(),
      });
    }
    for (const seq of lead.emailSequences) {
      if (!seq.sentAt) continue;
      history.push({
        type: 'email',
        label: `Email ${seq.sequenceStep} sent`,
        at: seq.sentAt.toISOString(),
      });
    }
    history.push({
      type: 'created',
      label: 'Company found',
      at: lead.createdAt.toISOString(),
    });

    history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return NextResponse.json({ history: history.slice(0, 20) });
  } catch (error: any) {
    console.error('Company history error:', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}
