import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaignId');

    const whereClause: any = { userId: user.id };
    if (campaignId) {
      whereClause.campaignId = campaignId;
    }

    const replies = await prisma.emailReply.findMany({
      where: whereClause,
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

    const aiModeCampaign = await prisma.campaign.findFirst({
      where: { userId: user.id, autoReplyEnabled: true, autoReplyMode: 'auto_send_safe' }
    });

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    });

    const hasAiModeEnabled = !!aiModeCampaign || userSettings?.autoSendMode === true;

    return NextResponse.json({ replies: mappedReplies, hasAiModeEnabled });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
