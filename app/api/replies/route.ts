import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const replies = await prisma.emailReply.findMany({
      where: { lead: { userId: user.id } },
      include: {
        lead: true,
        campaign: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const mappedReplies = replies.map(r => ({
      ...r,
      emailBody: r.body,
      aiCategory: r.classification || 'Unknown'
    }));

    return NextResponse.json({ replies: mappedReplies });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
