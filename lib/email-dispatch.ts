import { prisma } from '@/lib/prisma';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { decryptSmtpPass } from '@/lib/smtp-encryption';

export interface SendCampaignEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  campaignId: string;
  leadId: string;
  emailSequenceId: string;
  sendLogId?: string;
}

export async function sendCampaignEmail({
  to,
  subject,
  html,
  text,
  campaignId,
  leadId,
  emailSequenceId,
  sendLogId
}: SendCampaignEmailOptions) {
  
  // Fetch all entities to perform safety checks
  const emailSequence = await prisma.emailSequence.findUnique({
    where: { id: emailSequenceId },
    include: {
      campaign: true,
      lead: true,
      user: true
    }
  });

  if (!emailSequence) {
    return { success: false, error: "Email sequence not found." };
  }

  const user = emailSequence.user;
  const campaign = emailSequence.campaign;
  const lead = emailSequence.lead;

  // Verify User exists
  if (!user) {
    return { success: false, error: "User associated with this email does not exist." };
  }

  // Verify ownership
  if (campaign.userId !== user.id) {
    return { success: false, error: "Campaign does not belong to the user." };
  }
  if (lead.userId !== user.id) {
    return { success: false, error: "Lead does not belong to the user." };
  }
  if (emailSequence.userId !== user.id || emailSequence.campaignId !== campaign.id) {
    return { success: false, error: "Email sequence does not belong to the correct user or campaign." };
  }

  // Campaign checks
  const bookingLink = campaign.bookingLink || campaign.ctaLink;
  if (!bookingLink) {
    return { success: false, error: "Campaign must have a booking link configured before sending." };
  }
  
  const hasUnsubscribeLine = !!(campaign.unsubscribeLine && campaign.unsubscribeLine.trim().length > 0);
  const hasUnsubscribeInSignature = !!(
    campaign.emailSignature &&
    campaign.emailSignature.toLowerCase().includes('unsubscribe')
  );
  if (!hasUnsubscribeLine && !hasUnsubscribeInSignature) {
    return { success: false, error: "Campaign must have an unsubscribe line configured before sending." };
  }

  // Email Sequence checks
  if (emailSequence.approvalStatus !== 'Approved') {
    return { success: false, error: "Email sequence must be Approved before sending." };
  }
  if (emailSequence.status === 'Sent') {
    return { success: false, error: "Email has already been sent." };
  }

  if (!subject || subject.trim() === '') {
    return { success: false, error: "Email subject cannot be empty." };
  }
  if (!html || html.trim() === '') {
    return { success: false, error: "Email body cannot be empty." };
  }

  let finalHtml = html;
  if (sendLogId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // 1. Inject open tracking pixel
    const pixelUrl = `${appUrl}/api/tracking/open/${sendLogId}`;
    finalHtml += `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
    
    // 2. Rewrite links for click tracking
    finalHtml = finalHtml.replace(/<a([^>]+)href=["']([^"']+)["']([^>]*)>/gi, (match, before, url, after) => {
      // Skip non-web links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }
      const trackingUrl = `${appUrl}/api/tracking/click?url=${encodeURIComponent(url)}&sendLogId=${sendLogId}`;
      return `<a${before}href="${trackingUrl}"${after}>`;
    });
  }

  // Lead checks
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    return { success: false, error: "Lead email address is invalid." };
  }
  
  // Use centralized anti-ban and safety checks
  const { canSendEmail } = require('./email/can-send-email');
  const safetyCheck = await canSendEmail(user.id, lead.id, campaign.id);
  if (!safetyCheck.canSend) {
    return { success: false, error: safetyCheck.reason };
  }

  // Check if User has their own verified SMTP
  const smtpAccount = await prisma.smtpAccount.findUnique({
    where: { userId: user.id }
  });

  const hasVerifiedSmtp = smtpAccount && smtpAccount.isVerified && smtpAccount.status === 'Active';

  // Fallback to global SendGrid
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const sendgridFromEmail = process.env.SENDGRID_FROM_EMAIL;
  const sendgridFromName = process.env.SENDGRID_FROM_NAME || "Funnelzen AI";
  const hasSendGrid = !!(sendgridApiKey && sendgridFromEmail);

  if (!hasVerifiedSmtp && !hasSendGrid) {
    return {
      success: false,
      error: "Connect SMTP or SendGrid before starting this campaign."
    };
  }

  // Priority 1: User's Verified SMTP
  if (hasVerifiedSmtp) {
    try {
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

      const mailOptions = {
        from: `"${smtpAccount.fromName}" <${smtpAccount.fromEmail}>`,
        to,
        subject,
        text: text || html.replace(/<[^>]+>/g, ''),
        html: finalHtml
      };

      const info = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error: any) {
      console.error("SMTP Send Error:", error.message);
      return { success: false, error: "SMTP sending failed. Please check your SMTP settings." };
    }
  }

  // Priority 2: Fallback to SendGrid
  if (hasSendGrid) {
    sgMail.setApiKey(sendgridApiKey);

    const msg = {
      to,
      from: {
        name: sendgridFromName,
        email: sendgridFromEmail
      },
      subject,
      html: finalHtml,
      text: text || html.replace(/<[^>]+>/g, ''),
    };

    try {
      const response = await sgMail.send(msg);
      const messageId = response[0]?.headers['x-message-id'];
      return {
        success: true,
        messageId
      };
    } catch (error: any) {
      console.error("SendGrid Send Error:", error.response?.body || error.message);
      
      const statusCode = error.code || error.response?.statusCode;
      
      if (statusCode === 401 || statusCode === 403) {
        return { success: false, error: "Email sending failed. Please check your SendGrid API key." };
      } else if (statusCode === 429) {
        return { success: false, error: "Email sending is temporarily limited. Please try again later." };
      } else if (error.message?.includes('verified sender')) {
        return { success: false, error: "Email sending failed. Please verify your sender email in SendGrid." };
      }
      
      return { success: false, error: "Email could not be sent. Please try again." };
    }
  }

  return { success: false, error: "No valid sending method found." };
}

export interface ProcessDueEmailsOptions {
  userId?: string;
  limit?: number;
}

export async function processDueEmails({ userId, limit }: ProcessDueEmailsOptions = {}) {
  const now = new Date();
  
  // Build query where clause
  const whereClause: any = {
    status: 'Queued',
    approvalStatus: 'Approved',
    scheduledAt: { lte: now },
    campaign: { status: 'Active' }
  };
  
  if (userId) {
    whereClause.userId = userId;
  }
  
  const dueEmails = await prisma.emailSequence.findMany({
    where: whereClause,
    take: limit || 25,
    include: {
      campaign: true,
      user: true,
      lead: true
    },
    orderBy: {
      scheduledAt: 'asc'
    }
  });

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  const userSendCounts: Record<string, number> = {};

  for (const email of dueEmails) {
    try {
      const { campaign, user, lead } = email;
      
      // 1. Check Unsubscribed
      const isUnsub = await prisma.unsubscribeList.findUnique({
        where: { userId_email: { userId: user.id, email: lead.email || '' } }
      });
      if (isUnsub || lead.status === 'Unsubscribed') {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Cancelled', errorMessage: 'Lead is unsubscribed' }
        });
        processedCount++;
        continue;
      }

      // 2. Check if Lead Replied, Booked, or met any other stop condition
      const stopStatuses = ['Booked', 'Not Interested', 'Replied', 'Bounced', 'Opportunity Won', 'Opportunity Lost', 'Spam complaint'];
      if (stopStatuses.includes(lead.status)) {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Cancelled', errorMessage: `Lead status is ${lead.status}` }
        });
        processedCount++;
        continue;
      }

      // Check EmailReply table for safety
      const hasReply = await prisma.emailReply.findFirst({
        where: { leadId: lead.id, campaignId: campaign.id }
      });
      if (hasReply) {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Cancelled', errorMessage: 'Stopped because lead replied.' }
        });
        processedCount++;
        continue;
      }

      // 3. Check Limits
      if (!userSendCounts[user.id]) userSendCounts[user.id] = 0;
      if (userSendCounts[user.id] >= 10) continue; // Max 10 per user run/day
      if (campaign.dailyLimit && userSendCounts[user.id] >= campaign.dailyLimit) continue;
      
      // Ensure delay is respected (check last sent email time for this campaign)
      if (campaign.sendDelaySeconds) {
        const lastSent = await prisma.emailSequence.findFirst({
          where: { campaignId: campaign.id, status: 'Sent' },
          orderBy: { sentAt: 'desc' }
        });
        if (lastSent && lastSent.sentAt) {
          const minNextSend = new Date(lastSent.sentAt.getTime() + campaign.sendDelaySeconds * 1000);
          if (now < minNextSend) continue; // Skip for now
        }
      }

      // Double-check: Make sure the email isn't already sent or isn't Queued
      // This protects against race conditions if process-due is run in parallel
      const freshSeq = await prisma.emailSequence.findUnique({
        where: { id: email.id }
      });
      if (!freshSeq || freshSeq.status !== 'Queued' || freshSeq.sentAt !== null) {
        continue;
      }

      // 4. Create SendLog immediately so we have the ID for the pixel tracking
      const sendLog = await prisma.emailSendLog.create({
        data: {
          campaignId: campaign.id,
          leadId: lead.id,
          emailSequenceId: email.id,
          subject: email.subject,
          body: email.body,
          status: 'Sending'
        }
      });

      processedCount++;
      const result = await sendCampaignEmail({
        to: lead.email || '',
        subject: email.subject,
        html: email.body, // plain text or HTML body
        campaignId: campaign.id,
        leadId: lead.id,
        emailSequenceId: email.id,
        sendLogId: sendLog.id
      });

      if (result.success) {
        // Success
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: {
            status: 'Sent',
            sentAt: new Date(),
            errorMessage: null
          }
        });

        // Log sent
        await prisma.emailSendLog.update({
          where: { id: sendLog.id },
          data: {
            status: 'Sent',
            sentAt: new Date()
          }
        });

        sentCount++;
        userSendCounts[user.id]++;
      } else {
        // Failed
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: {
            status: 'Failed',
            errorMessage: result.error || 'Send failed'
          }
        });

        // Log failed send
        await prisma.emailSendLog.update({
          where: { id: sendLog.id },
          data: {
            status: 'Failed',
            errorMessage: result.error || 'Send failed'
          }
        });

        failedCount++;
      }

    } catch (err: any) {
      console.error('Failed to process single email:', err);
      failedCount++;
    }
  }

  return {
    success: true,
    processed: processedCount,
    sent: sentCount,
    failed: failedCount
  };
}
