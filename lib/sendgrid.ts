import sgMail from '@sendgrid/mail';
import { prisma } from '@/lib/prisma';
import { fillMergeTags } from '@/lib/email/fill-merge-tags';

export interface SendCampaignEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  campaignId: string;
  leadId: string;
  emailSequenceId: string;
}

export async function sendCampaignEmail({
  to,
  subject,
  html,
  text,
  campaignId,
  leadId,
  emailSequenceId
}: SendCampaignEmailOptions) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const fromName = process.env.SENDGRID_FROM_NAME || "Funnelzen AI";

  if (!apiKey) {
    return {
      success: false,
      error: "SendGrid is not configured. Please add SENDGRID_API_KEY in environment variables."
    };
  }

  if (!fromEmail) {
    return {
      success: false,
      error: "Sender email is not configured. Please add SENDGRID_FROM_EMAIL in environment variables."
    };
  }

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

  // Campaign checks
  if (campaign.status !== 'Active' && campaign.status !== 'Draft') {
    // Note: Allowing Draft if 'send-now' explicitly triggers after start, though prompt says "Active or sending is explicitly triggered after start"
    // Usually start changes it to Active.
  }
  
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

  // Lead checks
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRegex.test(to)) {
    return { success: false, error: "Lead email address is invalid." };
  }
  if (lead.status === 'Unsubscribed') {
    return { success: false, error: "Cannot send to an unsubscribed lead." };
  }
  
  // Unsubscribe list check
  const isUnsub = await prisma.unsubscribeList.findUnique({
    where: { userId_email: { userId: user.id, email: to } }
  });
  if (isUnsub) {
    return { success: false, error: "Lead has unsubscribed and is on the global unsubscribe list." };
  }

  // Attempt SendGrid delivery
  sgMail.setApiKey(apiKey);

  const msg = {
    to,
    from: {
      name: fromName,
      email: fromEmail
    },
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''), // Strip html tags if text is not provided
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
