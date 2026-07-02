import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  const isDev = process.env.NODE_ENV === 'development';
  const isAdmin = user?.role === 'ADMIN';

  if (!isDev && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const emailRepliesCount = await prisma.emailReply.count();
    const queuedAiReplies = await prisma.emailReply.count({
      where: { aiReplyStatus: 'Queued' }
    });
    const draftAiReplies = await prisma.emailReply.count({
      where: { aiReplyStatus: 'Draft' }
    });
    const autoReplyEnabledCampaigns = await prisma.campaign.count({
      where: { autoReplyEnabled: true }
    });

    const distinctCampaigns = await prisma.emailReply.groupBy({
      by: ['campaignId'],
      where: { campaignId: { not: null } }
    });
    const campaignsWithReplies = distinctCampaigns.length;

    const recentReplies = await prisma.emailReply.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fromEmail: true,
        subject: true,
        classification: true,
        aiReplyStatus: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      replyInboundRouteExists: true,
      replyWebhookRouteExists: true,
      emailRepliesCount,
      recentReplies,
      campaignsWithReplies,
      queuedAiReplies,
      draftAiReplies,
      autoReplyEnabledCampaigns,
      cronSecretConfigured: !!process.env.CRON_SECRET
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
