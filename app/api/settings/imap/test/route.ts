import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import { ImapFlow } from 'imapflow';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SMTP_ENCRYPTION_KEY) {
    return NextResponse.json({
      success: false,
      error: "SMTP/IMAP encryption key is not configured."
    }, { status: 500 });
  }

  let dbAccount = await prisma.smtpAccount.findUnique({
    where: { userId: user.id }
  });

  try {
    const body = await req.json().catch(() => ({}));
    const requestPassword = body.imapPassword;

    if (!dbAccount) {
      return NextResponse.json({ success: false, error: 'Please save your IMAP settings first.' }, { status: 400 });
    }

    const host = body.imapHost || dbAccount.imapHost;
    const port = body.imapPort ? parseInt(body.imapPort, 10) : dbAccount.imapPort;
    const secure = body.imapSecure !== undefined ? body.imapSecure : dbAccount.imapSecure;

    let dbUsername = '';
    if (dbAccount.imapUsernameEncrypted) {
      try {
        dbUsername = decryptSmtpPass(dbAccount.imapUsernameEncrypted);
      } catch (e) {
        dbUsername = dbAccount.imapUsername || '';
      }
    } else {
      dbUsername = dbAccount.imapUsername || '';
    }

    const username = body.imapUsername || dbUsername;

    let decryptedPassword = '';
    if (requestPassword) {
      decryptedPassword = requestPassword;
    } else if (dbAccount.imapPasswordEncrypted) {
      decryptedPassword = decryptSmtpPass(dbAccount.imapPasswordEncrypted);
    }

    if (!host || !port || !username) {
      return NextResponse.json({ success: false, error: 'IMAP settings (host, port, username) are incomplete.' }, { status: 400 });
    }

    if (!decryptedPassword) {
      return NextResponse.json({ success: false, error: 'IMAP password is missing. Please save your password.' }, { status: 400 });
    }

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: {
        user: username,
        pass: decryptedPassword
      },
      logger: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000
    });

    await client.connect();
    
    const lock = await client.getMailboxLock('INBOX');
    lock.release();

    await client.logout();

    await prisma.smtpAccount.update({
      where: { userId: user.id },
      data: { imapVerified: true }
    });

    return NextResponse.json({
      success: true,
      message: 'IMAP connection test succeeded.'
    });

  } catch (error: any) {
    console.error("IMAP connection test failed:", error);

    if (dbAccount) {
      await prisma.smtpAccount.update({
        where: { userId: user.id },
        data: { imapVerified: false }
      });
    }

    let friendlyError = "IMAP test failed. Please check your IMAP settings.";
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';

    if (msg.includes('login') || msg.includes('auth') || msg.includes('credential') || msg.includes('invalid') || code === 'EAUTH') {
      friendlyError = "IMAP login failed. Use an app password if your provider requires it.";
    } else if (msg.includes('timeout') || code === 'ETIMEDOUT') {
      friendlyError = "IMAP connection timed out.";
    } else if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || msg.includes('connect')) {
      friendlyError = "Could not connect to IMAP server. Check host, port, and secure setting.";
    }

    return NextResponse.json({
      success: false,
      error: friendlyError
    }, { status: 400 });
  }
}
