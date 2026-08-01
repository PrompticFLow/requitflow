import { prisma } from '@/lib/prisma';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { decryptSmtpPass } from '@/lib/smtp-encryption';
import {
  sendViaResend,
  resolveCampaignResendSender,
  campaignSentTodayCount,
  resolveReplyThreadingHeaders,
  resolveResendApiKey,
} from '@/lib/resend';
import { fillMergeTags } from '@/lib/email/fill-merge-tags';

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

  // Fill any merge tags the AI left in ({{firstName}}, {{painPoints}}, …) so
  // raw placeholders never reach a prospect's inbox.
  const mergeCtx = { lead, campaign, user };
  subject = fillMergeTags(subject, mergeCtx);
  html = fillMergeTags(html, mergeCtx);
  if (text) text = fillMergeTags(text, mergeCtx);

  // An unsubscribe link is auto-appended to every tracked send (see below),
  // so a manual unsubscribe line is only required for untracked sends.
  const hasUnsubscribeLine = !!(campaign.unsubscribeLine && campaign.unsubscribeLine.trim().length > 0);
  const hasUnsubscribeInSignature = !!(
    campaign.emailSignature &&
    campaign.emailSignature.toLowerCase().includes('unsubscribe')
  );
  if (!sendLogId && !hasUnsubscribeLine && !hasUnsubscribeInSignature) {
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
  let unsubscribeUrl: string | null = null;
  if (sendLogId) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // 1. Rewrite links for click tracking (before appending the unsubscribe link,
    //    which must stay untracked so it always works)
    finalHtml = finalHtml.replace(/<a([^>]+)href=["']([^"']+)["']([^>]*)>/gi, (match, before, url, after) => {
      // Skip non-web links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }
      const trackingUrl = `${appUrl}/api/tracking/click?url=${encodeURIComponent(url)}&sendLogId=${sendLogId}`;
      return `<a${before}href="${trackingUrl}"${after}>`;
    });

    // 2. Append unsubscribe footer
    unsubscribeUrl = `${appUrl}/api/unsubscribe/${sendLogId}`;
    finalHtml += `<br/><br/><p style="font-size:12px;color:#94a3b8;">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p>`;

    // 3. Inject open tracking pixel
    const pixelUrl = `${appUrl}/api/tracking/open/${sendLogId}`;
    finalHtml += `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
  }

  // Lead checks
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    return { success: false, error: "Lead email address is invalid." };
  }
  
  // Use centralized anti-ban and safety checks. Manually started sequences
  // bypass the soft stops (replied / booked / lead status) — the user chose
  // to send; unsubscribe/suppression and send limits still apply.
  const { canSendEmail } = require('./email/can-send-email');
  const safetyCheck = await canSendEmail(user.id, lead.id, campaign.id, {
    isReplyEmail: emailSequence.sequenceStep >= 99,
    manualOverride: (emailSequence as any).manualStart === true
  });
  if (!safetyCheck.canSend) {
    return { success: false, error: safetyCheck.reason };
  }

  // Priority 0: account-level Resend API key + the campaign's sender email
  const resendSender = await resolveCampaignResendSender(user.id, campaign as any);
  if (resendSender) {
    try {
      const dailyCap = campaign.dailyLimit || 50;
      const sentToday = await campaignSentTodayCount(campaign.id);
      if (sentToday >= dailyCap) {
        return { success: false, error: `Daily sending limit reached for this campaign (${dailyCap}/day). Emails will resume tomorrow.` };
      }

      const headers: Record<string, string> = {};
      if (unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      // Reply emails (step >= 99) must stay in the original thread
      if (emailSequence.sequenceStep >= 99) {
        Object.assign(headers, await resolveReplyThreadingHeaders(campaign.id, lead.id));
      }

      const info = await sendViaResend(resendSender.apiKey, {
        to,
        subject,
        html: finalHtml,
        text: text || html.replace(/<[^>]+>/g, ''),
        fromEmail: resendSender.fromEmail,
        fromName: campaign.senderName || user.name || undefined,
        replyTo: resendSender.fromEmail,
        headers,
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('Resend send error:', error?.message);
      return { success: false, error: error?.message || 'Resend sending failed. Check the Resend API key and this campaign\'s sender email.' };
    }
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
      error: "Add a Resend API key and sender email to this campaign (or configure SMTP/SendGrid) before sending."
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

      const mailOptions: any = {
        from: `"${smtpAccount.fromName}" <${smtpAccount.fromEmail}>`,
        to,
        subject,
        text: text || html.replace(/<[^>]+>/g, ''),
        html: finalHtml
      };

      if (emailSequence.sequenceStep >= 99) {
        const inbound = await prisma.emailReply.findFirst({
          where: {
            campaignId: campaign.id,
            leadId: lead.id,
            messageId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { messageId: true },
        });
        if (inbound?.messageId) {
          mailOptions.headers = {
            'In-Reply-To': inbound.messageId,
            'References': inbound.messageId,
          };
        }
      }

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

    const msg: any = {
      to,
      from: {
        name: sendgridFromName,
        email: sendgridFromEmail
      },
      subject,
      html: finalHtml,
      text: text || html.replace(/<[^>]+>/g, ''),
    };

    if (emailSequence.sequenceStep >= 99) {
      const inbound = await prisma.emailReply.findFirst({
        where: {
          campaignId: campaign.id,
          leadId: lead.id,
          messageId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { messageId: true },
      });
      if (inbound?.messageId) {
        msg.headers = {
          'In-Reply-To': inbound.messageId,
          'References': inbound.messageId,
        };
      }
    }

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

/**
 * Sends one already-created EmailSequence row right now, without waiting for the
 * background scheduler tick. Used by the inbound-reply webhook so an AI
 * auto-reply goes out the moment the reply lands.
 *
 * On failure the row is left Queued so the scheduler retries it on its next tick.
 */
export async function sendSequenceEmailNow(emailSequenceId: string) {
  const email = await prisma.emailSequence.findUnique({
    where: { id: emailSequenceId },
    include: { campaign: true, lead: true }
  });

  if (!email) return { success: false, error: 'Email sequence not found.' };
  if (email.status === 'Sent' || email.sentAt) {
    return { success: false, error: 'Email has already been sent.' };
  }

  const sendLog = await prisma.emailSendLog.create({
    data: {
      campaignId: email.campaignId,
      leadId: email.leadId,
      emailSequenceId: email.id,
      subject: email.subject,
      body: email.body,
      status: 'Sending'
    }
  });

  const result = await sendCampaignEmail({
    to: email.lead.email || '',
    subject: email.subject,
    html: /<[a-z][\s\S]*>/i.test(email.body) ? email.body : email.body.replace(/\n/g, '<br/>'),
    campaignId: email.campaignId,
    leadId: email.leadId,
    emailSequenceId: email.id,
    sendLogId: sendLog.id
  });

  if (result.success) {
    await prisma.emailSequence.update({
      where: { id: email.id },
      data: { status: 'Sent', sentAt: new Date(), errorMessage: null }
    });
    await prisma.emailSendLog.update({
      where: { id: sendLog.id },
      data: { status: 'Sent', sentAt: new Date() }
    });
  } else {
    // Keep it Queued so the background scheduler retries it later.
    await prisma.emailSequence.update({
      where: { id: email.id },
      data: { status: 'Queued', errorMessage: result.error || 'Send failed' }
    });
    await prisma.emailSendLog.update({
      where: { id: sendLog.id },
      data: { status: 'Failed', errorMessage: result.error || 'Send failed' }
    });
  }

  return result;
}

export interface ProcessDueEmailsOptions {
  userId?: string;
  limit?: number;
}

export async function processDueEmails({ userId, limit }: ProcessDueEmailsOptions = {}) {
  const now = new Date();

  // Candidates: approved emails in Active campaigns that haven't been sent yet.
  // Dueness is decided per-email below (scheduledAt, or delay after previous step),
  // so this fully drives sequences in the background — no app session needed.
  const whereClause: any = {
    status: { in: ['Queued', 'Scheduled', 'Draft'] },
    approvalStatus: 'Approved',
    sentAt: null,
    campaign: { status: 'Active' }
  };

  if (userId) {
    whereClause.userId = userId;
  }

  const dueEmails = await prisma.emailSequence.findMany({
    where: whereClause,
    take: Math.max((limit || 25) * 4, 100),
    include: {
      campaign: true,
      user: true,
      lead: true
    },
    orderBy: [
      { sequenceStep: 'asc' },
      { createdAt: 'asc' }
    ]
  });

  // Per-user daily send caps: the campaign's configured limit when a Resend
  // sender is set up, otherwise the legacy conservative default.
  const resolveDailyCap = async (campaign: any): Promise<number> => {
    if (campaign.resendFromEmail && (await resolveResendApiKey(campaign.userId))) {
      return campaign.dailyLimit || 50;
    }
    return campaign.dailyLimit || 10;
  };

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  const userSendCounts: Record<string, number> = {};

  for (const email of dueEmails) {
    try {
      const { campaign, user, lead } = email;

      // AI reply-continuation emails (step 99) are conversational responses:
      // they send on their scheduled time and must NOT be blocked/cancelled
      // just because the lead replied — that's exactly why they exist.
      const isReplyEmail = email.sequenceStep >= 99;

      // 0. Dueness check
      if (isReplyEmail) {
        if (email.scheduledAt && email.scheduledAt > now) continue;
      } else if (email.sequenceStep > 1) {
        // Follow-up: never due before the previous step was sent, regardless
        // of any scheduledAt stamp — and only after the delay has elapsed.
        const prevStep = await prisma.emailSequence.findFirst({
          where: { campaignId: campaign.id, leadId: lead.id, sequenceStep: email.sequenceStep - 1 }
        });
        if (!prevStep || prevStep.status !== 'Sent' || !prevStep.sentAt) continue;

        // delayAmount is cumulative days-from-start; derive the gap from the previous step
        const gapDays = Math.max(1, (email.delayAmount || 1) - (prevStep.delayAmount || 0));
        const daysSincePrev = (now.getTime() - prevStep.sentAt.getTime()) / (1000 * 3600 * 24);
        if (daysSincePrev < gapDays) continue;
      } else if (email.scheduledAt && email.scheduledAt > now) {
        continue;
      }
      // Step 1 without scheduledAt is due immediately.

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

      // Manually started sequences (Start Sequence button) bypass the soft
      // safeguards below — only hard compliance stops apply to them.
      const isManual = (email as any).manualStart === true;

      // 2. Check hard stop conditions on the lead. Note: 'Replied' is NOT a
      // global stop — a reply only pauses the campaign it happened in (see the
      // campaign-scoped EmailReply check below), never other campaigns.
      const stopStatuses = isManual
        ? ['Bounced', 'Unsubscribed', 'Spam complaint']
        : isReplyEmail
          ? ['Not Interested', 'Bounced', 'Unsubscribed', 'Spam complaint']
          : ['Booked', 'Not Interested', 'Bounced', 'Opportunity Won', 'Opportunity Lost', 'Spam complaint'];
      if (stopStatuses.includes(lead.status)) {
        await prisma.emailSequence.update({
          where: { id: email.id },
          data: { status: 'Cancelled', errorMessage: `Lead status is ${lead.status}` }
        });
        processedCount++;
        continue;
      }

      // Campaign-scoped reply stop (sequence emails only): a reply in THIS
      // campaign cancels its remaining steps. Replies that couldn't be matched
      // to a campaign (campaignId null) stop everywhere, to stay safe.
      if (!isReplyEmail && !isManual) {
        const hasReply = await prisma.emailReply.findFirst({
          where: {
            leadId: lead.id,
            OR: [{ campaignId: campaign.id }, { campaignId: null }]
          }
        });
        if (hasReply) {
          await prisma.emailSequence.update({
            where: { id: email.id },
            data: { status: 'Cancelled', errorMessage: 'Stopped because lead replied in this campaign.' }
          });
          processedCount++;
          continue;
        }
      }

      // 3. Check Limits
      if (!userSendCounts[user.id]) userSendCounts[user.id] = 0;
      const dailyCap = await resolveDailyCap(campaign);
      if (userSendCounts[user.id] >= dailyCap) continue;
      if (campaign.dailyLimit && userSendCounts[user.id] >= campaign.dailyLimit) continue;
      if (sentCount >= (limit || 25)) break;
      
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
      if (!freshSeq || !['Queued', 'Scheduled', 'Draft'].includes(freshSeq.status) || freshSeq.sentAt !== null) {
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
        html: /<[a-z][\s\S]*>/i.test(email.body) ? email.body : email.body.replace(/\n/g, '<br/>'),
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

        // Keep the inbound EmailReply in sync when this was an AI auto-reply
        if (isReplyEmail) {
          await prisma.emailReply.updateMany({
            where: {
              campaignId: campaign.id,
              leadId: lead.id,
              aiReplyStatus: { in: ['Queued', 'Draft'] },
            },
            data: { aiReplyStatus: 'Sent', status: 'Handled' },
          });
        }

        // Log sent
        await prisma.emailSendLog.update({
          where: { id: sendLog.id },
          data: {
            status: 'Sent',
            sentAt: new Date()
          }
        });

        // Stamp the next step's send time so the UI can show "Sends in N days"
        const nextStep = await prisma.emailSequence.findFirst({
          where: { campaignId: campaign.id, leadId: lead.id, sequenceStep: email.sequenceStep + 1 }
        });
        if (nextStep && !nextStep.sentAt && nextStep.status !== 'Cancelled') {
          const gapDays = Math.max(1, (nextStep.delayAmount || 1) - (email.delayAmount || 0));
          const nextTime = new Date();
          nextTime.setDate(nextTime.getDate() + gapDays);
          await prisma.emailSequence.update({
            where: { id: nextStep.id },
            data: { status: nextStep.approvalStatus === 'Approved' ? 'Scheduled' : nextStep.status, scheduledAt: nextTime }
          });
        }

        sentCount++;
        userSendCounts[user.id]++;
      } else {
        // Rate limits are temporary — keep the email Queued so the next
        // scheduler tick retries it, instead of marking it dead.
        const isTemporary = /limit .*reached|limit reached|try again later/i.test(result.error || '');

        await prisma.emailSequence.update({
          where: { id: email.id },
          data: {
            status: isTemporary ? 'Queued' : 'Failed',
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

        if (!isTemporary) failedCount++;
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
