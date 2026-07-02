import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { decryptSmtpPass } from '@/lib/smtp-encryption';

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();

    const dueReplies = await prisma.emailReply.findMany({
      where: {
        aiReplyStatus: 'Queued',
        aiReplyScheduledAt: { lte: now },
        canAutoSend: true,
        campaign: {
          autoReplyEnabled: true,
          autoReplyMode: 'auto_send_safe',
        }
      },
      include: {
        user: true,
        campaign: true,
        lead: true
      },
      take: 25
    });

    if (dueReplies.length === 0) {
      return NextResponse.json({ success: true, message: 'No AI replies due.' });
    }

    let sentCount = 0;

    for (const reply of dueReplies) {
      try {
        const { user, campaign, lead } = reply;
        
        if (!campaign || !lead) {
          throw new Error('Missing campaign or lead data');
        }

        if (!campaign.bookingLink) {
          throw new Error('Booking link missing');
        }

        // Check if Lead is unsubscribed
        const isUnsub = await prisma.unsubscribeList.findUnique({
          where: { userId_email: { userId: user.id, email: lead.email || reply.fromEmail } }
        });
        if (isUnsub || lead.status === 'Unsubscribed') {
          throw new Error('Lead is unsubscribed');
        }

        const smtp = await prisma.smtpAccount.findUnique({ where: { userId: user.id } });
        const fromEmail = smtp?.fromEmail || campaign.senderEmail || user.email;
        const fromName = smtp?.fromName || campaign.senderName || user.name;

        const hasVerifiedSmtp = smtp && smtp.isVerified && smtp.status === 'Active';
        const hasSendGrid = !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

        if (!hasVerifiedSmtp && !hasSendGrid) {
          throw new Error('No verified sender available');
        }

        if (hasVerifiedSmtp && smtp) {
          const pass = decryptSmtpPass(smtp.smtpPassEncrypted);
          const username = decryptSmtpPass(smtp.smtpUserEncrypted);
          const transporter = nodemailer.createTransport({
            host: smtp.smtpHost,
            port: smtp.smtpPort,
            secure: smtp.secure,
            auth: { user: username, pass },
          });

          await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: reply.fromEmail,
            subject: reply.aiReplySubject || `Re: ${reply.subject}`,
            text: reply.aiSuggestedReply || '',
          });
        } else if (hasSendGrid) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
          const msg = {
            to: reply.fromEmail,
            from: { email: process.env.SENDGRID_FROM_EMAIL!, name: fromName },
            subject: reply.aiReplySubject || `Re: ${reply.subject}`,
            text: reply.aiSuggestedReply || '',
          };
          await sgMail.send(msg);
        }

        await prisma.emailReply.update({
          where: { id: reply.id },
          data: {
            aiReplyStatus: 'Sent',
            aiReplySentAt: now,
            status: 'Handled'
          }
        });

        sentCount++;

      } catch (err: any) {
        console.error('Failed to send AI reply:', err);
        await prisma.emailReply.update({
          where: { id: reply.id },
          data: {
            aiReplyStatus: 'Failed',
            status: 'Unread'
          }
        });
      }
    }

    return NextResponse.json({ success: true, sent: sentCount });

  } catch (error: any) {
    console.error('Process replies error:', error);
    return NextResponse.json({ error: 'Failed to process AI replies' }, { status: 500 });
  }
}
