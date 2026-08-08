import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Notification = {
  id: string;
  type: 'reply' | 'call' | 'activity';
  title: string;
  body: string;
  href: string;
  createdAt: string;
};

const MAX_PER_SOURCE = 15;
const MAX_TOTAL = 30;

function leadName(lead: { businessName?: string | null; fullName?: string | null } | null, fallback = 'a lead') {
  return lead?.fullName || lead?.businessName || fallback;
}

function truncate(text: string, length = 120) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const leadSelect = { select: { businessName: true, fullName: true } };

    const [replies, calls, activities] = await Promise.all([
      prisma.emailReply.findMany({
        where: { userId: user.id },
        include: { lead: leadSelect },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_SOURCE,
      }),
      prisma.bookedCall.findMany({
        where: { userId: user.id },
        include: { lead: leadSelect },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_SOURCE,
      }),
      prisma.activityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_SOURCE,
      }),
    ]);

    const notifications: Notification[] = [
      ...replies.map((r): Notification => ({
        id: `reply-${r.id}`,
        type: 'reply',
        title: `New reply from ${leadName(r.lead, r.fromEmail)}`,
        body: truncate(r.subject || r.body || 'Open the inbox to read this reply.'),
        href: '/dashboard/replies',
        createdAt: r.createdAt.toISOString(),
      })),
      ...calls.map((c): Notification => ({
        id: `call-${c.id}`,
        type: 'call',
        title: `Call booked with ${leadName(c.lead)}`,
        body: c.callDate
          ? `Scheduled for ${c.callDate.toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}`
          : `Status: ${c.status}`,
        href: '/dashboard/booked-calls',
        createdAt: c.createdAt.toISOString(),
      })),
      ...activities.map((a): Notification => ({
        id: `activity-${a.id}`,
        type: 'activity',
        title: a.activityType,
        body: truncate(a.description),
        href: '/dashboard',
        createdAt: a.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_TOTAL);

    return NextResponse.json({ notifications });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
