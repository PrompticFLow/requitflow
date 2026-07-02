import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import nodemailer from 'nodemailer';
import { mapSmtpError } from '@/lib/smtp-errors';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const account = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    if (!account) {
      return NextResponse.json({ error: 'No SMTP settings found.' }, { status: 404 });
    }

    if (!account.isVerified) {
      return NextResponse.json({ error: 'SMTP must be verified before sending a test email.' }, { status: 400 });
    }

    const password = decryptSmtpPass(account.smtpPassEncrypted);
    const username = decryptSmtpPass(account.smtpUserEncrypted);

    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.secure,
      auth: {
        user: username,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    const mailOptions = {
      from: `"${account.fromName}" <${account.fromEmail}>`,
      to: user.email,
      subject: 'SMTP test from Funnelzen AI',
      text: 'Your SMTP connection is working successfully.',
      html: '<strong>Your SMTP connection is working successfully.</strong>'
    };

    try {
      await transporter.sendMail(mailOptions);
      return NextResponse.json({ success: true, message: 'Test email sent successfully!' });
    } catch (sendError: any) {
      console.error("SMTP test email failed:", {
        name: sendError?.name,
        code: sendError?.code,
        command: sendError?.command,
        responseCode: sendError?.responseCode,
        message: sendError?.message,
      });

      let friendlyError = mapSmtpError(sendError);
      return NextResponse.json({ error: friendlyError }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Send Test Email Route Error:", error.message);
    return NextResponse.json({ error: 'Internal server error during SMTP test email.' }, { status: 500 });
  }
}
