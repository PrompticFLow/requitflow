import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import sgMail from '@sendgrid/mail';
import { sendViaResend, resolveCampaignResendSender } from '@/lib/resend';
import { buildReplySubject } from '@/lib/email/reply-subject';

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const queuedReplies = await prisma.emailReply.findMany({
      where: {
        aiReplyStatus: 'Queued',
        aiReplyScheduledAt: { lte: now },
        status: { not: 'Handled' }
      },
      include: {
        lead: true,
        campaign: true,
        user: true
      },
      take: 50
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const reply of queuedReplies) {
      if (!reply.lead || !reply.campaign || !reply.aiSuggestedReply) {
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { aiReplyStatus: 'Failed', status: 'Handled' }
        });
        failedCount++;
        continue;
      }

      // The reply handler already creates a step-99 EmailSequence for every
      // auto-send reply (sent inline on the webhook, retried by the background
      // scheduler if that failed). Skip those here so the same reply can never
      // go out twice.
      const existingReplySequence = await prisma.emailSequence.findFirst({
        where: {
          campaignId: reply.campaignId || undefined,
          leadId: reply.leadId || undefined,
          sequenceStep: { gte: 99 },
          createdAt: { gte: reply.createdAt }
        }
      });
      if (existingReplySequence) {
        if (existingReplySequence.status === 'Sent') {
          await prisma.emailReply.update({
            where: { id: reply.id },
            data: { aiReplyStatus: 'Sent', status: 'Handled' }
          });
        }
        continue;
      }

      try {
        const resendSender = await resolveCampaignResendSender(reply.userId, reply.campaign as any);

        const smtpAccount = await prisma.smtpAccount.findUnique({
          where: { userId: reply.userId }
        });

        const hasVerifiedSmtp = smtpAccount && smtpAccount.isVerified && smtpAccount.status === 'Active';
        const sendgridApiKey = process.env.SENDGRID_API_KEY;
        const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL;
        const hasSendGrid = !!(sendgridApiKey && sendgridFromEmail);

        if (!resendSender && !hasVerifiedSmtp && !hasSendGrid) {
          await prisma.emailReply.update({
            where: { id: reply.id },
            data: { aiReplyStatus: 'Failed (No Sender)' }
          });
          failedCount++;
          continue;
        }

        const to = reply.lead.email;
        const emailSubject = buildReplySubject(
          reply.aiReplySubject || reply.subject,
          reply.campaign.name
        );
        const emailBody = reply.aiSuggestedReply.replace(/\n/g, '<br/>');
        const storedMessageId = (reply as any).messageId as string | null | undefined;

        let sentMessageId = '';

        if (resendSender) {
          const headers: Record<string, string> = {};
          if (storedMessageId) {
            headers['In-Reply-To'] = storedMessageId;
            headers['References'] = storedMessageId;
          }
          const info = await sendViaResend(resendSender.apiKey, {
            to: to as string,
            subject: emailSubject,
            html: emailBody,
            fromEmail: resendSender.fromEmail,
            fromName: reply.campaign.senderName || reply.user.name || undefined,
            replyTo: (reply.campaign as any).resendReplyTo || resendSender.fromEmail,
            headers,
          });
          sentMessageId = info.messageId || '';
        } else if (hasVerifiedSmtp) {
          const password = decryptSmtpPass(smtpAccount.smtpPassEncrypted);
          const username = decryptSmtpPass(smtpAccount.smtpUserEncrypted);

          const transporter = nodemailer.createTransport({
            host: smtpAccount.smtpHost,
            port: smtpAccount.smtpPort,
            secure: smtpAccount.secure,
            auth: {
              user: username,
              pass: password
            }
          });

          const mailOptions: any = {
            from: `"${smtpAccount.fromName || reply.user.name || 'AI SDR'}" <${smtpAccount.fromEmail}>`,
            to: to as string,
            subject: emailSubject,
            html: emailBody,
          };
          if (storedMessageId) {
            mailOptions.headers = {
              'In-Reply-To': storedMessageId,
              'References': storedMessageId
            };
          }
          const info = await transporter.sendMail(mailOptions);
          sentMessageId = info.messageId;
        } else {
          sgMail.setApiKey(sendgridApiKey!);
          const msg: any = {
            to: to as string,
            from: {
              email: sendgridFromEmail as string,
              name: process.env.SENDGRID_FROM_NAME || 'AI SDR'
            },
            subject: emailSubject,
            html: emailBody,
          };
          if (storedMessageId) {
            msg.headers = {
              'In-Reply-To': storedMessageId,
              'References': storedMessageId
            };
          }

          const [response] = await sgMail.send(msg);
          sentMessageId = response.headers['x-message-id'] || 'sendgrid-generated-id';
        }

        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { status: 'Handled', aiReplyStatus: 'Sent' }
        });

        await prisma.emailSequence.create({
          data: {
            userId: reply.userId,
            campaignId: reply.campaign.id,
            leadId: reply.lead.id,
            sequenceStep: 99,
            subject: emailSubject,
            body: emailBody,
            status: 'Sent',
            approvalStatus: 'Approved',
            sentAt: new Date()
          }
        });

        sentCount++;
      } catch (err: any) {
        console.error(`Failed to send AI auto-reply for ID ${reply.id}:`, err);
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: { aiReplyStatus: 'Failed' }
        });
        failedCount++;
      }
    }

    return NextResponse.json({ success: true, processed: queuedReplies.length, sentCount, failedCount });

  } catch (error: any) {
    console.error('AI Auto-reply cron failed:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
