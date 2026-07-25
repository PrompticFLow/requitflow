import { prisma } from './prisma';

export interface ReadinessItem {
  key: string;
  label: string;
  passed: boolean;
  actionHint: string;
}

export interface ReadinessResult {
  ready: boolean;
  items: ReadinessItem[];
  missingRequirements: string[]; // backward compat
}

export async function checkCampaignReadyToStart(
  campaignId: string,
  userId: string
): Promise<ReadinessResult> {
  const missingRequirements: string[] = [];
  const items: ReadinessItem[] = [];

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      campaignLeads: true,
      emailSequences: {
        where: { sequenceStep: 1 }
      }
    }
  });

  if (!campaign || campaign.userId !== userId) {
    return {
      ready: false,
      items: [],
      missingRequirements: ['Campaign not found or does not belong to user']
    };
  }

  const userSettings = await prisma.userSettings.findUnique({ where: { userId } });

  // 1. Sender email check: campaign Gmail account, verified SMTP, or SendGrid
  const hasSendGridKey = !!process.env.SENDGRID_API_KEY;
  const hasSendGridEmail = !!process.env.SENDGRID_FROM_EMAIL;

  const smtpAccount = await prisma.smtpAccount.findUnique({ where: { userId } });
  const hasVerifiedSmtp = smtpAccount && smtpAccount.isVerified && smtpAccount.status === 'Active';

  let gmailAccount: any = null;
  if ((campaign as any).gmailAccountId) {
    gmailAccount = await prisma.gmailAccount.findUnique({ where: { id: (campaign as any).gmailAccountId } });
  }
  const hasCampaignGmail = !!(gmailAccount && gmailAccount.status === 'Active');

  const senderOk = hasCampaignGmail || hasVerifiedSmtp || (hasSendGridKey && hasSendGridEmail);

  items.push({
    key: 'senderEmail',
    label: 'Sender email connected',
    passed: senderOk,
    actionHint: 'Connect a Gmail account to this campaign (or configure SMTP/SendGrid) before starting.'
  });

  if (!senderOk) {
    missingRequirements.push('Connect a Gmail sending account before starting.');
  }

  // 2. Booking link (optional — emails fall back to a reply-based CTA without one)
  const bookingLink = campaign.bookingLink || campaign.ctaLink || userSettings?.bookingLink;
  const bookingOk = !!(bookingLink && bookingLink.startsWith('http'));
  items.push({
    key: 'bookingLink',
    label: 'Booking link added (optional)',
    passed: bookingOk,
    actionHint: 'Optional: add a booking link so emails can link to your calendar.'
  });

  // 3. Unsubscribe: a tracked unsubscribe link is auto-appended to every send
  items.push({
    key: 'unsubscribeLine',
    label: 'Unsubscribe link (added automatically)',
    passed: true,
    actionHint: 'An unsubscribe link is appended to every email automatically.'
  });

  // 4. Leads check
  const leadsOk = campaign.campaignLeads.length > 0;
  items.push({
    key: 'leads',
    label: 'Leads selected',
    passed: leadsOk,
    actionHint: 'Add at least one lead to this campaign.'
  });
  if (!leadsOk) {
    missingRequirements.push('Add at least one lead to the campaign');
  }

  // 5. Email 1 generated for all leads
  let email1GeneratedOk = true;
  let email1ApprovedOk = true;

  if (campaign.campaignLeads.length > 0) {
    const step1Emails = campaign.emailSequences;
    const leadIds = campaign.campaignLeads.map(cl => cl.leadId);
    const emailLeadIds = step1Emails.map(e => e.leadId);

    if (step1Emails.length === 0) {
      email1GeneratedOk = false;
      missingRequirements.push('Generate Email Step 1 for the campaign leads');
    } else {
      const missingDrafts = leadIds.filter(id => !emailLeadIds.includes(id));
      if (missingDrafts.length > 0) {
        email1GeneratedOk = false;
        missingRequirements.push('Generate Email Step 1 drafts for all campaign leads');
      }
    }

    if (email1GeneratedOk) {
      const rejectedCount = step1Emails.filter(e => e.approvalStatus === 'Rejected').length;
      if (rejectedCount > 0) {
        email1ApprovedOk = false;
        missingRequirements.push('No Step 1 email draft can be Rejected');
      } else {
        const unapprovedCount = step1Emails.filter(e => e.approvalStatus !== 'Approved').length;
        if (unapprovedCount > 0) {
          email1ApprovedOk = false;
          missingRequirements.push('Approve Email 1 for all selected leads');
        }
      }
    }
  }

  items.push({
    key: 'email1Generated',
    label: 'Email 1 generated for all leads',
    passed: email1GeneratedOk,
    actionHint: 'Generate AI email drafts for all campaign leads.'
  });

  items.push({
    key: 'email1Approved',
    label: 'Email 1 approved for all leads',
    passed: email1ApprovedOk,
    actionHint: 'Review and approve Email 1 for all leads before starting.'
  });

  // 6. Daily sending limit (Gmail account limit, then SMTP, then campaign/settings)
  const dailyLimitVal = gmailAccount?.dailyLimit
    || smtpAccount?.dailyLimit
    || campaign.dailyLimit
    || userSettings?.dailyEmailLimit
    || 0;
  const delaySeconds = smtpAccount?.delayBetweenEmailsSeconds || campaign.sendDelaySeconds || 120;

  const dailyLimitOk = dailyLimitVal >= 1 && dailyLimitVal <= 500 && delaySeconds >= 30 && delaySeconds <= 3600;

  items.push({
    key: 'dailyLimit',
    label: 'Sending limit configured',
    passed: dailyLimitOk,
    actionHint: 'Configure a daily sending limit between 1 and 500 emails.'
  });
  if (!dailyLimitOk) {
    missingRequirements.push('Set sending limit and delay before starting.');
  }

  return {
    ready: missingRequirements.length === 0,
    items,
    missingRequirements
  };
}
