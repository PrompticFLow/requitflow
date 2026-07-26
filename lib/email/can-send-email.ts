import { prisma } from '../../lib/prisma';

export type CanSendResult = {
  canSend: boolean;
  reason: string;
};

export async function canSendEmail(
  userId: string,
  leadId: string,
  campaignId: string,
  options: { isReplyEmail?: boolean } = {}
): Promise<CanSendResult> {
  // 1. Check if Lead Unsubscribed
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      replies: true,
      bookedCalls: true
    }
  });

  if (!lead) return { canSend: false, reason: "Lead not found." };
  
  if (lead.status === "Unsubscribed") {
    return { canSend: false, reason: "Lead has unsubscribed." };
  }

  if (!lead.email) {
    return { canSend: false, reason: "Lead is missing email address." };
  }

  // 2/3. Replied & booked leads block sequence emails — but NOT AI reply
  // continuations, which exist precisely to answer a lead who replied.
  if (!options.isReplyEmail) {
    if (lead.replies && lead.replies.length > 0) {
      return { canSend: false, reason: "Lead has already replied." };
    }

    if (lead.status === "Replied" || lead.status === "Interested" || lead.status === "Not Interested") {
      return { canSend: false, reason: `Lead status is ${lead.status}.` };
    }

    if (lead.bookedCalls && lead.bookedCalls.length > 0) {
      return { canSend: false, reason: "Lead has booked a call." };
    }

    if (lead.status === "Call Booked" || lead.status === "Closed") {
      return { canSend: false, reason: `Lead status is ${lead.status}.` };
    }
  } else if (lead.status === "Not Interested") {
    return { canSend: false, reason: "Lead is not interested." };
  }

  // 4. Check Hourly/Daily limits
  const smtpAccount = await prisma.smtpAccount.findUnique({
    where: { userId }
  });

  // Default daily limit 100, hourly derived as daily / 8 (approx active hours) for safety
  const dailyLimit = smtpAccount?.dailyLimit || 100;
  const hourlyLimit = Math.ceil(dailyLimit / 8); 

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfHour = new Date();
  startOfHour.setMinutes(0, 0, 0);

  const dailyCount = await prisma.emailSendLog.count({
    where: {
      campaign: { userId },
      sentAt: { gte: startOfDay }
    }
  });

  if (dailyCount >= dailyLimit) {
    return { canSend: false, reason: `Daily limit of ${dailyLimit} reached.` };
  }

  const hourlyCount = await prisma.emailSendLog.count({
    where: {
      campaign: { userId },
      sentAt: { gte: startOfHour }
    }
  });

  if (hourlyCount >= hourlyLimit) {
    return { canSend: false, reason: `Hourly limit of ${hourlyLimit} reached.` };
  }
  
  // 5. Global suppression list check
  const suppressed = await prisma.unsubscribeList.findFirst({
    where: {
      userId,
      email: lead.email
    }
  });

  if (suppressed) {
    return { canSend: false, reason: "Email is on the global suppression list." };
  }

  // If all checks pass
  return { canSend: true, reason: "All safety checks passed." };
}
