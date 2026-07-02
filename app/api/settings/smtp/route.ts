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
      error: "SMTP encryption key is not configured."
    }, { status: 500 });
  }

  try {
    const account = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    if (!account) {
      return NextResponse.json({ success: true, smtp: null });
    }

    let smtpUsername = '';
    try {
      smtpUsername = decryptSmtpPass(account.smtpUserEncrypted);
      // Verify that password can also be decrypted
      if (account.smtpPassEncrypted) {
        decryptSmtpPass(account.smtpPassEncrypted);
      }
    } catch (decryptError) {
      return NextResponse.json({
        success: false,
        error: "SMTP password could not be decrypted. Please re-enter and save your SMTP password."
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      smtp: {
        senderName: account.fromName,
        senderEmail: account.fromEmail,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpSecure: account.secure,
        smtpUsername: smtpUsername,
        verified: account.isVerified,
        dailyLimit: account.dailyLimit,
        delayBetweenEmailsSeconds: account.delayBetweenEmailsSeconds,
        hasPassword: !!account.smtpPassEncrypted
      }
    });
  } catch (error: any) {
    console.error("SMTP fetch failed:", {
      name: error?.name,
      message: error?.message,
      code: error?.code
    });
    return NextResponse.json({
      success: false,
      error: "SMTP settings could not be loaded."
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SMTP_ENCRYPTION_KEY) {
    return NextResponse.json({
      success: false,
      error: "SMTP encryption key is not configured."
    }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      senderName,
      senderEmail,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUsername,
      smtpPassword,
      dailyLimit,
      delayBetweenEmailsSeconds
    } = body;

    // Validate required fields
    if (!senderEmail || !senderEmail.includes('@')) {
      return NextResponse.json({ success: false, error: 'Please enter a valid sender email.' }, { status: 400 });
    }
    if (!smtpHost) {
      return NextResponse.json({ success: false, error: 'SMTP host is required.' }, { status: 400 });
    }
    if (!smtpPort) {
      return NextResponse.json({ success: false, error: 'SMTP port is required.' }, { status: 400 });
    }
    if (!smtpUsername) {
      return NextResponse.json({ success: false, error: 'SMTP username is required.' }, { status: 400 });
    }

    const existingAccount = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    if (!existingAccount && !smtpPassword) {
      return NextResponse.json({ success: false, error: 'SMTP password is required for first setup.' }, { status: 400 });
    }

    // Decryption validity check on existing password if no new password is sent
    let finalSmtpPassEncrypted = existingAccount?.smtpPassEncrypted || '';
    if (!smtpPassword && existingAccount) {
      try {
        decryptSmtpPass(existingAccount.smtpPassEncrypted);
      } catch (decryptError) {
        return NextResponse.json({
          success: false,
          error: "SMTP password could not be decrypted. Please re-enter and save your SMTP password."
        }, { status: 400 });
      }
    } else if (smtpPassword) {
      finalSmtpPassEncrypted = encryptSmtpPass(smtpPassword);
    }

    const parsedPort = parseInt(smtpPort, 10);
    const parsedDailyLimit = dailyLimit ? parseInt(dailyLimit, 10) : 10;
    const finalDailyLimit = Math.min(Math.max(1, parsedDailyLimit), 10);

    // Determine if settings changed to reset verified status
    let resetVerification = true;
    if (existingAccount) {
      let oldDecryptedUsername = '';
      try {
        oldDecryptedUsername = decryptSmtpPass(existingAccount.smtpUserEncrypted);
      } catch (e) {
        // failed decryption means it needs reset anyway
      }

      const unchanged =
        existingAccount.fromEmail === senderEmail &&
        existingAccount.fromName === (senderName || '') &&
        existingAccount.smtpHost === smtpHost &&
        existingAccount.smtpPort === parsedPort &&
        existingAccount.secure === (smtpSecure !== undefined ? smtpSecure : true) &&
        oldDecryptedUsername === smtpUsername &&
        !smtpPassword; // If new password is provided, it's changed

      if (unchanged) {
        resetVerification = false;
      }
    }

    const dataToSave: any = {
      smtpHost,
      smtpPort: parsedPort,
      smtpUserEncrypted: encryptSmtpPass(smtpUsername),
      smtpPassEncrypted: finalSmtpPassEncrypted,
      fromName: senderName || '',
      fromEmail: senderEmail,
      secure: smtpSecure !== undefined ? smtpSecure : true,
      dailyLimit: finalDailyLimit,
      delayBetweenEmailsSeconds: delayBetweenEmailsSeconds ? parseInt(delayBetweenEmailsSeconds, 10) : 120,
      isVerified: resetVerification ? false : existingAccount?.isVerified || false,
      status: resetVerification ? "Failed" : existingAccount?.status || "Active"
    };

    const account = await prisma.smtpAccount.upsert({
      where: { userId: user.id },
      update: dataToSave,
      create: {
        userId: user.id,
        ...dataToSave
      }
    });

    return NextResponse.json({
      success: true,
      message: "SMTP settings saved successfully.",
      smtp: {
        senderName: account.fromName,
        senderEmail: account.fromEmail,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpSecure: account.secure,
        smtpUsername: smtpUsername,
        verified: account.isVerified,
        dailyLimit: account.dailyLimit,
        delayBetweenEmailsSeconds: account.delayBetweenEmailsSeconds
      }
    });
  } catch (error: any) {
    console.error("SMTP save failed:", {
      name: error?.name,
      message: error?.message,
      code: error?.code
    });
    return NextResponse.json({
      success: false,
      error: "SMTP settings could not be saved. Please check your settings and try again."
    }, { status: 500 });
  }
}
