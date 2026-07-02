import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encryptSmtpPass, decryptSmtpPass } from '@/lib/smtp-encryption';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SMTP_ENCRYPTION_KEY) {
    return NextResponse.json({
      success: false,
      error: "SMTP/IMAP encryption key is not configured."
    }, { status: 500 });
  }

  try {
    const account = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    if (!account) {
      return NextResponse.json({ success: true, imap: null });
    }

    let imapUsername = '';
    if (account.imapUsernameEncrypted) {
      try {
        imapUsername = decryptSmtpPass(account.imapUsernameEncrypted);
      } catch (e) {
        imapUsername = account.imapUsername || '';
      }
    } else {
      imapUsername = account.imapUsername || '';
    }

    if (!imapUsername && account.imapHost) {
      imapUsername = account.fromEmail;
    }

    return NextResponse.json({
      success: true,
      imap: {
        replyCaptureMethod: account.replyCaptureMethod || 'imap',
        imapHost: account.imapHost || '',
        imapPort: account.imapPort || 993,
        imapSecure: account.imapSecure,
        imapUsername: imapUsername,
        imapEnabled: account.imapEnabled,
        imapVerified: account.imapVerified,
        imapLastSyncedAt: account.imapLastSyncedAt,
        hasPassword: !!account.imapPasswordEncrypted,
        sendgridInboundEnabled: account.sendgridInboundEnabled,
        sendgridInboundDomain: account.sendgridInboundDomain || ''
      }
    });
  } catch (error: any) {
    console.error("IMAP fetch failed:", error);
    return NextResponse.json({
      success: false,
      error: "IMAP settings could not be loaded."
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SMTP_ENCRYPTION_KEY) {
    return NextResponse.json({
      success: false,
      error: "SMTP/IMAP encryption key is not configured."
    }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      replyCaptureMethod,
      imapHost,
      imapPort,
      imapSecure,
      imapUsername,
      imapPassword,
      imapEnabled,
      sendgridInboundEnabled,
      sendgridInboundDomain
    } = body;

    const isImap = (replyCaptureMethod || 'imap') === 'imap';

    // Validate required fields if enabled and method is imap
    if (isImap && imapEnabled) {
      if (!imapHost) {
        return NextResponse.json({ success: false, error: 'IMAP host is required.' }, { status: 400 });
      }
      if (!imapPort) {
        return NextResponse.json({ success: false, error: 'IMAP port is required.' }, { status: 400 });
      }
      if (!imapUsername) {
        return NextResponse.json({ success: false, error: 'IMAP username is required.' }, { status: 400 });
      }
    }

    const existingAccount = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    if (isImap && imapEnabled && !existingAccount && !imapPassword) {
      return NextResponse.json({ success: false, error: 'IMAP password is required for first setup.' }, { status: 400 });
    }

    let finalImapPassEncrypted = existingAccount?.imapPasswordEncrypted || null;
    if (imapPassword) {
      finalImapPassEncrypted = encryptSmtpPass(imapPassword);
    }

    const parsedPort = imapPort ? parseInt(imapPort, 10) : 993;

    // Determine if settings changed to reset verified status
    let resetVerification = true;
    if (existingAccount) {
      let existingUsername = '';
      if (existingAccount.imapUsernameEncrypted) {
        try {
          existingUsername = decryptSmtpPass(existingAccount.imapUsernameEncrypted);
        } catch (e) {
          existingUsername = existingAccount.imapUsername || '';
        }
      } else {
        existingUsername = existingAccount.imapUsername || '';
      }

      const unchanged =
        existingAccount.replyCaptureMethod === (replyCaptureMethod || 'imap') &&
        existingAccount.imapHost === imapHost &&
        existingAccount.imapPort === parsedPort &&
        existingAccount.imapSecure === (imapSecure !== undefined ? imapSecure : true) &&
        existingUsername === imapUsername &&
        !imapPassword;

      if (unchanged) {
        resetVerification = false;
      }
    }

    const dataToSave: any = {
      replyCaptureMethod: replyCaptureMethod || 'imap',
      imapHost: imapHost || '',
      imapPort: parsedPort,
      imapSecure: imapSecure !== undefined ? imapSecure : true,
      imapUsername: imapUsername || '',
      imapUsernameEncrypted: imapUsername ? encryptSmtpPass(imapUsername) : null,
      imapPasswordEncrypted: finalImapPassEncrypted,
      imapEnabled: imapEnabled !== undefined ? imapEnabled : false,
      imapVerified: resetVerification ? false : existingAccount?.imapVerified || false,
      sendgridInboundEnabled: sendgridInboundEnabled !== undefined ? sendgridInboundEnabled : false,
      sendgridInboundDomain: sendgridInboundDomain || null
    };

    if (!existingAccount) {
      await prisma.smtpAccount.create({
        data: {
          userId: user.id,
          smtpHost: '',
          smtpPort: 587,
          smtpUserEncrypted: '',
          smtpPassEncrypted: '',
          fromName: user.name || '',
          fromEmail: user.email,
          ...dataToSave
        }
      });
    } else {
      await prisma.smtpAccount.update({
        where: { userId: user.id },
        data: dataToSave
      });
    }

    return NextResponse.json({
      success: true,
      message: "Reply capture settings saved successfully."
    });
  } catch (error: any) {
    console.error("IMAP save failed:", error);
    return NextResponse.json({
      success: false,
      error: "IMAP settings could not be saved."
    }, { status: 500 });
  }
}
