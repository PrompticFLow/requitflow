import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendCampaignEmail } from '@/lib/sendgrid';
export async function POST(req: Request) {
  try {
    // Check authorization (e.g. cron secret)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    // Find all approved, pending emails that are due
    const dueEmails = await prisma.emailSequence.findMany({
      where: {
        status: 'Pending', // changed to Pending per requirements
        approvalStatus: 'Approved',
        scheduledAt: { lte: now },
        campaign: { status: 'Active' },
        lead: {
          email: { not: null },
          // 'Replied' is intentionally not filtered here: a reply only stops
          // the campaign it happened in (checked per-campaign below).
          status: { notIn: ['Unsubscribed', 'Booked'] }
        }
      },
      include: {
        lead: true,
        campaign: true,
        user: {
          include: { smtpAccount: true }
        }
      },
      take: 50 // process in batches of 50
    });

    const results = [];

    for (const email of dueEmails) {
      // Check SMTP verified
      const smtp = email.user.smtpAccount;
      if (!smtp || !smtp.isVerified || smtp.status !== 'Active') {
        // According to requirements, SMTP must be verified
        results.push({ id: email.id, status: 'skipped', reason: 'SMTP not verified' });
        continue;
      }

      // Check if lead unsubscribed or booked a call to prevent sending (extra safety check though DB query filters it)
      if (email.lead.status === 'Unsubscribed' || email.lead.status === 'Booked') {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Stopped', timingReason: `Stopped due to lead status: ${email.lead.status}` }
        });
        results.push({ id: email.id, status: 'stopped', reason: email.lead.status });
        continue;
      }

      // A reply stops sequences only in the campaign it was received in
      const repliedInCampaign = await prisma.emailReply.findFirst({
        where: {
          leadId: email.leadId,
          OR: [{ campaignId: email.campaignId }, { campaignId: null }]
        },
        select: { id: true }
      });
      if (repliedInCampaign) {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Stopped', timingReason: 'Stopped because lead replied in this campaign' }
        });
        results.push({ id: email.id, status: 'stopped', reason: 'Replied in this campaign' });
        continue;
      }

      try {
        const sendResult = await sendCampaignEmail({
          to: email.lead.email!,
          subject: email.subject,
          html: email.body,
          campaignId: email.campaignId,
          leadId: email.leadId,
          emailSequenceId: email.id
        });

        if (!sendResult.success) {
          throw new Error(sendResult.error);
        }

        // Log the send
        await prisma.emailSendLog.create({
          data: {
            campaignId: email.campaignId,
            leadId: email.leadId,
            emailSequenceId: email.id,
            subject: email.subject,
            body: email.body,
            status: 'Sent'
          }
        });

        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Sent', sentAt: new Date() }
        });
        
        results.push({ id: email.id, status: 'sent' });
      } catch (err: any) {
        console.error(`SMTP Send failed for sequence ${email.id}`, err);
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Failed', errorMessage: err.message }
        });
        results.push({ id: email.id, status: 'failed', reason: err.message });
      }
    }

    return NextResponse.json({ success: true, processed: dueEmails.length, results });

  } catch (error: any) {
    console.error('Process Due Emails Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
