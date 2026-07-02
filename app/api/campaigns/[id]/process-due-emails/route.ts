import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { sendCampaignEmail } from '@/lib/email-dispatch';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const campaignId = (await params).id;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'Active') {
      return NextResponse.json({ error: 'Campaign must be Active to send emails.' }, { status: 400 });
    }

    // Fetch SMTP settings for daily limit
    const smtpAccount = await prisma.smtpAccount.findUnique({ where: { userId: user.id } });
    const dailyLimit = smtpAccount?.dailyLimit || 10;
    const finalDailyLimit = Math.min(10, Math.max(1, dailyLimit));

    // Count emails sent today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sentTodayCount = await prisma.emailSendLog.count({
      where: {
        campaign: { userId: user.id },
        sentAt: { gte: startOfDay }
      }
    });

    const remainingDailyLimit = Math.max(0, finalDailyLimit - sentTodayCount);
    if (remainingDailyLimit <= 0) {
      return NextResponse.json({ success: true, message: 'Daily limit reached. Max 10 per day.' });
    }

    const batchLimit = Math.min(10, remainingDailyLimit);

    // Fetch approved emails that are due based on scheduledAt
    const dueEmails = await prisma.emailSequence.findMany({
      where: {
        campaignId,
        approvalStatus: 'Approved',
        status: { in: ['Draft', 'Scheduled'] },
        OR: [
          { scheduledAt: { lte: new Date() } },
          { scheduledAt: null, sequenceStep: 1 } // Fallback for old data
        ],
        lead: {
          email: { not: null },
          // Do not send to leads that have replied or unsubscribed or bounced or booked call
          status: { notIn: ['Replied', 'Unsubscribed', 'Bounced', 'Call Booked'] }
        }
      },
      include: { lead: true },
      orderBy: { sequenceStep: 'asc' },
      take: batchLimit
    });

    let sentCount = 0;
    const errors = [];

    // Queue processing without serverless sleep
    for (const sequence of dueEmails) {
      // Respect delay rules if scheduledAt is null (for legacy Step 2+ without scheduling)
      if (sequence.sequenceStep > 1 && !sequence.scheduledAt) {
        const prevStep = await prisma.emailSequence.findFirst({
          where: { campaignId, leadId: sequence.leadId, sequenceStep: sequence.sequenceStep - 1 }
        });
        if (!prevStep || prevStep.status !== 'Sent' || !prevStep.sentAt) {
          continue; // Wait for previous step to be sent first
        }
        
        const delayAmount = (sequence as any).delayAmount || (sequence as any).delayDays || 1;
        const daysSincePrev = (new Date().getTime() - prevStep.sentAt.getTime()) / (1000 * 3600 * 24);
        if (daysSincePrev < delayAmount) {
          continue; // Not due yet
        }
      }

      // Check unsubscribe list globally again just in case
      const isUnsub = await prisma.unsubscribeList.findUnique({
        where: { userId_email: { userId: user.id, email: sequence.lead.email! } }
      });
      if (isUnsub) continue;

      const finalSubject = sequence.editedSubject || sequence.aiOriginalSubject || sequence.subject;
      const finalBody = sequence.editedBody || sequence.aiOriginalBody || sequence.body;

      try {
        const sendResult = await sendCampaignEmail({
          to: sequence.lead.email!,
          subject: finalSubject,
          html: finalBody.replace(/\n/g, '<br/>'),
          campaignId: sequence.campaignId,
          leadId: sequence.leadId,
          emailSequenceId: sequence.id
        });

        if (!sendResult.success) {
          throw new Error(sendResult.error);
        }

        await prisma.emailSequence.update({
          where: { id: sequence.id },
          data: { status: 'Sent', sentAt: new Date() }
        });

        await prisma.emailSendLog.create({
          data: {
            campaignId: sequence.campaignId,
            leadId: sequence.leadId,
            emailSequenceId: sequence.id,
            subject: finalSubject,
            body: finalBody,
            status: 'Sent',
            sentAt: new Date()
          }
        });

        // Schedule the next step automatically for this lead to rely purely on scheduledAt in the future
        const nextStep = await prisma.emailSequence.findFirst({
          where: { campaignId: sequence.campaignId, leadId: sequence.leadId, sequenceStep: sequence.sequenceStep + 1 }
        });
        
        if (nextStep) {
          const delayAmount = (nextStep as any).delayAmount || (nextStep as any).delayDays || 1;
          const nextTime = new Date();
          nextTime.setDate(nextTime.getDate() + delayAmount);
          await prisma.emailSequence.update({
            where: { id: nextStep.id },
            data: { status: 'Scheduled', scheduledAt: nextTime }
          });
        }
        
        sentCount++;
      } catch (sendError: any) {
        console.error("Queue Send Failed:", sendError);
        
        await prisma.emailSequence.update({
          where: { id: sequence.id },
          data: { status: 'Failed', errorMessage: sendError.message }
        });
        
        errors.push({ id: sequence.id, error: sendError.message });
      }
    }

    return NextResponse.json({ success: true, sentCount, errors });
  } catch (error: any) {
    console.error("Process due emails error:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
