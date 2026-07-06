import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } } });

    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Generate a short-lived reset token (1 hour)
    const token = jwt.sign({ userId: user.id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f1117; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <h2 style="color: #a78bfa; margin-bottom: 8px;">Reset Your Password</h2>
        <p style="color: #94a3b8; margin-bottom: 24px;">Hi ${user.name || 'there'},</p>
        <p style="margin-bottom: 24px;">Click the button below to reset your FunnelZen AI password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(to right, #7c3aed, #2563eb); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px;">
          Reset Password
        </a>
        <p style="color: #64748b; font-size: 12px; margin-top: 32px; word-break: break-all;">
          Or copy this link: ${resetUrl}
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 16px;">If you didn't request this, ignore this email. Your password won't change.</p>
      </div>
    `;

    // Try ANY verified SMTP account in the system (not just the requesting user's)
    const smtpAccount = await prisma.smtpAccount.findFirst({
      where: { isVerified: true, status: 'Active', smtpHost: { not: '' } }
    });

    if (smtpAccount) {
      const { decryptSmtpPass } = await import('@/lib/smtp-encryption');
      const smtpPassword = decryptSmtpPass(smtpAccount.smtpPassEncrypted!);
      const smtpUsername = decryptSmtpPass(smtpAccount.smtpUserEncrypted!);

      const transporter = nodemailer.createTransport({
        host: smtpAccount.smtpHost,
        port: smtpAccount.smtpPort,
        secure: smtpAccount.secure,
        auth: { user: smtpUsername, pass: smtpPassword },
        tls: { rejectUnauthorized: false }
      });

      await transporter.sendMail({
        from: `"FunnelZen AI" <${smtpAccount.fromEmail}>`,
        to: email.trim(),
        subject: 'Reset Your FunnelZen AI Password',
        html: htmlBody
      });

      console.log(`[Forgot Password] Reset email sent to ${email} via ${smtpAccount.smtpHost}`);
    } else if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
      // Fallback: SendGrid
      const sgMail = (await import('@sendgrid/mail')).default;
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: email.trim(),
        from: { email: process.env.SENDGRID_FROM_EMAIL, name: 'FunnelZen AI' },
        subject: 'Reset Your FunnelZen AI Password',
        html: htmlBody
      });
      console.log(`[Forgot Password] Reset email sent to ${email} via SendGrid`);
    } else {
      // Dev fallback — print link to terminal
      console.log(`\n[Forgot Password - DEV] Reset link for ${email}:\n${resetUrl}\n`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to send reset email. Please try again.' }, { status: 500 });
  }
}
