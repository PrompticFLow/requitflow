import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import nodemailer from 'nodemailer';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import sgMail from '@sendgrid/mail';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { body, subject } = await req.json();

    if (!body) {
      return NextResponse.json({ error: 'Reply body is required.' }, { status: 400 });
    }

    const reply = await prisma.emailReply.findUnique({
      where: { id, userId: user.id },
      include: {
        lead: true,
        campaign: true,
      }
    });

    if (!reply || !reply.lead || !reply.campaign) {
      return NextResponse.json({ error: 'Reply, Lead, or Campaign not found.' }, { status: 404 });
    }

    // Check SMTP config
    const smtpAccount = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    const hasVerifiedSmtp = smtpAccount && smtpAccount.isVerified && smtpAccount.status === 'Active';
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL;
    const hasSendGrid = !!(sendgridApiKey && sendgridFromEmail);

    if (!hasVerifiedSmtp && !hasSendGrid) {
      return NextResponse.json({ error: 'No verified SMTP or SendGrid configured to send emails.' }, { status: 400 });
    }

    const to = reply.lead.email;
    const emailSubject = subject || `Re: ${reply.campaign.name}`;
    const emailBody = body.replace(/\n/g, '<br/>');

    let sentMessageId = '';

    // Send email
    if (hasVerifiedSmtp) {
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
        from: `"${smtpAccount.fromName || user.name || 'AI SDR'}" <${smtpAccount.fromEmail}>`,
        to: to as string,
        subject: emailSubject,
        html: emailBody,
      };

      if ((reply as any).messageId) {
        mailOptions.headers = {
          'In-Reply-To': (reply as any).messageId,
          'References': (reply as any).messageId
        };
      }

      const info = await transporter.sendMail(mailOptions);
      sentMessageId = info.messageId;
    } else {
      // Fallback to SendGrid
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

      if ((reply as any).messageId) {
        msg.headers = {
          'In-Reply-To': (reply as any).messageId,
          'References': (reply as any).messageId
        };
      }
      
      const [response] = await sgMail.send(msg);
      sentMessageId = response.headers['x-message-id'] || 'sendgrid-generated-id';
    }

    // Mark reply as handled
    await prisma.emailReply.update({
      where: { id },
      data: { status: 'Handled' }
    });

    // Create an EmailSequence record to log this manual reply
    await prisma.emailSequence.create({
      data: {
        userId: user.id,
        campaignId: reply.campaign.id,
        leadId: reply.lead.id,
        sequenceStep: 99, // 99 indicates manual reply
        subject: emailSubject,
        body: emailBody,
        status: 'Sent',
        approvalStatus: 'Approved',
        sentAt: new Date()
      }
    });

    return NextResponse.json({ success: true, message: 'Reply sent successfully.' });

  } catch (error: any) {
    console.error('Error sending manual reply:', error);
    return NextResponse.json({ error: error.message || 'Failed to send reply.' }, { status: 500 });
  }
}
