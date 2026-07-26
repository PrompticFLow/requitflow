import { prisma } from './prisma';
import { generateAiResponse } from './ai-provider';
import { getAvailableSlots, bookCalendarEvent } from './google-calendar';
import { extractLatestReplyText } from './email/strip-quoted-reply';
import { buildReplySubject } from './email/reply-subject';

export interface InboundReplyPayload {
  fromEmail: string;
  toEmail?: string;
  subject?: string;
  body: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  campaignId?: string;
  leadId?: string;
  emailSequenceId?: string;
}

export { extractLatestReplyText } from './email/strip-quoted-reply';

function hasUnsubscribeIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const phrases = [
    'unsubscribe',
    'remove me',
    'stop emailing',
    'opt out',
    'take me off',
    'do not contact',
    'don\'t contact',
    'stop contacting',
  ];
  if (phrases.some((p) => lower.includes(p))) return true;
  // Bare "stop" only as a whole short reply, not inside other words / quoted copy
  return /^\s*stop[.!]?\s*$/i.test(text.trim());
}

export async function handleInboundReply(payload: InboundReplyPayload) {
  const {
    fromEmail,
    toEmail,
    subject,
    body,
    messageId,
    inReplyTo,
    references,
    campaignId,
    leadId,
    emailSequenceId
  } = payload;

  if (!fromEmail || !body) {
    throw new Error('fromEmail and body are required.');
  }

  // 1. Normalize reply fields
  const normalizedFrom = fromEmail.trim().toLowerCase();
  const normalizedTo = toEmail ? toEmail.trim().toLowerCase() : '';
  const normalizedSubject = subject ? subject.trim() : '';
  const normalizedBody = body.trim();
  const latestReplyText = extractLatestReplyText(normalizedBody);

  // 1.5 Deduplication Check
  const dedupeQueries: any[] = [
    {
      fromEmail: normalizedFrom,
      subject: normalizedSubject,
      body: normalizedBody
    }
  ];
  if (messageId) {
    dedupeQueries.push({ messageId });
  }

  const existingReply = await prisma.emailReply.findFirst({
    where: {
      OR: dedupeQueries
    }
  });

  if (existingReply) {
    return {
      success: false,
      message: 'Reply already processed.',
      replyId: existingReply.id,
      classification: existingReply.classification,
      aiReplyStatus: existingReply.aiReplyStatus,
      futureFollowUpsCancelled: 0
    };
  }

  // 2. Identify the entities (Priority matching)
  let matchedLead: any = null;
  let matchedCampaign: any = null;
  let matchedUser: any = null;
  let matchedSequence: any = null;

  // Priority A: emailSequenceId if provided
  if (emailSequenceId) {
    matchedSequence = await prisma.emailSequence.findUnique({
      where: { id: emailSequenceId },
      include: { lead: true, campaign: true, user: true }
    });
    if (matchedSequence) {
      matchedLead = matchedSequence.lead;
      matchedCampaign = matchedSequence.campaign;
      matchedUser = matchedSequence.user;
    }
  }

  // Priority C: leadId (+ optional campaignId via CampaignLead, not only Lead.campaignId)
  if (!matchedLead && leadId) {
    matchedLead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { campaign: true, user: true }
    });
    if (matchedLead) {
      matchedUser = matchedLead.user;
      if (campaignId) {
        const campaignLead = await prisma.campaignLead.findFirst({
          where: { leadId, campaignId },
          include: { campaign: true }
        });
        matchedCampaign =
          campaignLead?.campaign ||
          (matchedLead.campaignId === campaignId ? matchedLead.campaign : null);
        if (!matchedCampaign) {
          matchedCampaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        }
      } else {
        const latestCampaignLead = await prisma.campaignLead.findFirst({
          where: { leadId },
          orderBy: { addedAt: 'desc' },
          include: { campaign: true }
        });
        matchedCampaign = latestCampaignLead?.campaign || matchedLead.campaign;
      }
    }
  }

  // Priority D: fromEmail + CampaignLead on an active campaign
  if (!matchedLead) {
    const campaignLead = await prisma.campaignLead.findFirst({
      where: {
        campaign: { status: 'Active' },
        lead: { email: { equals: normalizedFrom, mode: 'insensitive' } }
      },
      orderBy: { addedAt: 'desc' },
      include: { lead: { include: { user: true } }, campaign: true }
    });
    if (campaignLead) {
      matchedLead = campaignLead.lead;
      matchedCampaign = campaignLead.campaign;
      matchedUser = campaignLead.lead.user;
    }
  }

  // Priority E: fromEmail + user/campaign if possible
  if (!matchedLead) {
    matchedLead = await prisma.lead.findFirst({
      where: {
        email: { equals: normalizedFrom, mode: 'insensitive' }
      },
      include: { campaign: true, user: true }
    });
    if (matchedLead) {
      matchedCampaign = matchedLead.campaign;
      matchedUser = matchedLead.user;
      if (!matchedCampaign) {
        const latestCampaignLead = await prisma.campaignLead.findFirst({
          where: { leadId: matchedLead.id },
          orderBy: { addedAt: 'desc' },
          include: { campaign: true }
        });
        matchedCampaign = latestCampaignLead?.campaign || null;
      }
    }
  }

  // If unmatched, try to find user by toEmail (matching SMTP account or user email)
  if (!matchedUser && normalizedTo) {
    const smtpAcc = await prisma.smtpAccount.findFirst({
      where: { fromEmail: { equals: normalizedTo, mode: 'insensitive' } }
    });
    if (smtpAcc) {
      matchedUser = await prisma.user.findUnique({
        where: { id: smtpAcc.userId }
      });
    } else {
      matchedUser = await prisma.user.findFirst({
        where: { email: { equals: normalizedTo, mode: 'insensitive' } }
      });
    }
  }

  // Fallback user if completely unmatched and no other user found
  if (!matchedUser) {
    matchedUser = await prisma.user.findFirst();
  }

  if (!matchedUser) {
    throw new Error('Could not identify a user associated with this reply.');
  }

  let futureFollowUpsCancelled = 0;

  // 3. Stop future follow-ups for same campaign + lead
  if (matchedCampaign && matchedLead) {
    const cancelRes = await prisma.emailSequence.updateMany({
      where: {
        campaignId: matchedCampaign.id,
        leadId: matchedLead.id,
        status: { in: ['Draft', 'Queued', 'Scheduled'] },
        sentAt: null
      },
      data: {
        status: 'Cancelled',
        errorMessage: 'Stopped because lead replied.'
      }
    });
    futureFollowUpsCancelled = cancelRes.count;
  }

  // Keywords check for Unsubscribe — only on the new reply text, not quoted originals
  const isUnsubscribeKeyword = hasUnsubscribeIntent(latestReplyText);

  let classification = 'Unknown';
  let confidence = 0.5;
  let shouldReply = false;
  let canAutoSend = false;
  let aiSuggestedReplyStr = '';
  let aiReplySubjectStr = buildReplySubject(normalizedSubject, 'Quick question');
  let detectedSlotIndex = -1;

  // Check Google Calendar Integration
  let calendarIntegration = null;
  if (matchedUser) {
    calendarIntegration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId: matchedUser.id }
    });
  }
  const isCalendarConnected = calendarIntegration?.connected && matchedCampaign?.bookingMethod !== 'Booking link';
  let availableSlots: any[] = [];
  let existingSuggestedSlots: any[] = [];

  if (isCalendarConnected && matchedLead) {
    // Check if we previously suggested slots
    existingSuggestedSlots = await prisma.suggestedCalendarSlot.findMany({
      where: { leadId: matchedLead.id, selected: false },
      orderBy: { start: 'asc' }
    });
  }

  // 4. Classify and Generate AI Suggested Reply
  if (matchedLead && matchedCampaign) {
    const bookingLink = matchedCampaign.bookingLink || '';
    
    // Fetch Knowledge Base
    const kbFiles = await prisma.knowledgeBaseFile.findMany({
      where: { campaignId: matchedCampaign.id, status: 'Ready' }
    });
    const kbContext = kbFiles.map(f => f.extractedText || '').join('\n\n').substring(0, 150000);
    
    // Fetch prior conversation history
    const priorEmails = await prisma.emailSequence.findMany({
      where: { campaignId: matchedCampaign.id, leadId: matchedLead.id, status: 'Sent' },
      orderBy: { sentAt: 'asc' }
    });
    const priorContext = priorEmails.map(e => `[Sent to Lead] Subject: ${e.subject}\n${e.body}`).join('\n\n');

    // Fetch prior replies from the lead
    const priorReplies = await prisma.emailReply.findMany({
      where: { campaignId: matchedCampaign.id, leadId: matchedLead.id },
      orderBy: { createdAt: 'asc' }
    });
    const priorReplyContext = priorReplies.map(r => `[Lead Reply] Subject: ${r.subject}\n${r.body}`).join('\n\n');

    const prompt = `You are an expert AI SDR (Sales Development Representative) handling a prospect's email reply.
Your primary objective is to convert conversations into booked sales calls whenever appropriate, while acting human, building trust, and answering questions.

Campaign Information:
- Audience: ${matchedCampaign.targetAudience || 'Professionals'}
- Goal: ${matchedCampaign.goal || 'Book discovery call'}
- Booking Link: ${bookingLink || 'None'}
- Calendar Connected: ${isCalendarConnected ? 'Yes' : 'No'}
- Offer: ${matchedCampaign.offer || 'None'}
- Main Benefit: ${matchedCampaign.mainBenefit || 'None'}
- Pain Points: ${matchedCampaign.painPoints || 'None'}
- Problem Solved: ${matchedCampaign.problemSolved || 'None'}
- Desired Outcome: ${matchedCampaign.desiredOutcome || 'None'}
- Unique Mechanism: ${matchedCampaign.uniqueMechanism || 'None'}
- Proof/Case Study: ${matchedCampaign.proofCaseStudy || 'None'}
- Common Objections: ${matchedCampaign.objections || 'None'}
- Words to Avoid: ${matchedCampaign.avoidSaying || 'None'}

Lead Details:
- Business: ${matchedLead.businessName || 'Business'}
- Email: ${matchedLead.email}

Knowledge Base (Use this to answer questions):
${kbContext ? kbContext : 'No knowledge base available.'}

Conversation History (Sent Emails):
${priorContext ? priorContext : 'No prior sent emails found.'}

Conversation History (Previous Replies from Lead):
${priorReplyContext ? priorReplyContext : 'No prior replies found.'}

CURRENT REPLY FROM LEAD (new text only — ignore any quoted original email):
"${latestReplyText}"

Previously Suggested Times (if any):
${existingSuggestedSlots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}

INSTRUCTIONS & RULES:
1. Intent Classification: Classify the reply strictly into one of the following exact strings:
   "Interested", "Wants pricing", "Wants demo", "Wants consultation", "Wants meeting", 
   "Wants more information", "Technical question", "Objection", "Budget concern", "Timing concern",
   "Decision maker issue", "Already using competitor", "Not interested", "Wrong person", 
   "Unsubscribe", "Out of office", "Spam", "Needs follow-up later", "Positive response", "Negative response".
   - If they picked a previously suggested time, classify as "Wants meeting" and set detectedSlotIndex.

2. Goal: Move toward a booked meeting, but never force it. Answer questions, build trust, handle objections logically based on KB.

3. Human Handoff: If they request a human, the answer requires legal/complex pricing not in KB, or if you are unsure, set "canAutoSend" to false and set "needsHuman" to true.

4. Booking:
   - If Calendar Connected is Yes and they want to book, DO NOT include the booking link. Instead, we will inject real slots later. Set canAutoSend to true.
   - If Calendar Connected is No, include the booking link ("${bookingLink}") if they are interested or want booking. Set canAutoSend to true.

5. Do NOT invent facts. Keep it concise. Do not reveal system logic.

Output ONLY valid JSON matching this schema:
{
  "classification": "Wants more information",
  "confidence": 0.9,
  "shouldReply": true,
  "canAutoSend": true,
  "needsHuman": false,
  "detectedSlotIndex": -1,
  "subject": "${buildReplySubject(normalizedSubject, 'Quick question')}",
  "body": "Your generated natural response here..."
}`;

    try {
      const aiResponse = await generateAiResponse(prompt, matchedUser.id);
      let jsonStr = (aiResponse || '').trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```/g, '').trim();

      const startIdx = jsonStr.indexOf('{');
      const endIdx = jsonStr.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        const parsed = JSON.parse(jsonStr.slice(startIdx, endIdx + 1));
        classification = parsed.classification || 'Unknown';
        confidence = parsed.confidence || 0.5;
        shouldReply = parsed.shouldReply || false;
        canAutoSend = parsed.canAutoSend || false;
        if (parsed.needsHuman) canAutoSend = false; // Override for human handoff
        aiSuggestedReplyStr = parsed.body || '';
        aiReplySubjectStr = buildReplySubject(parsed.subject || aiReplySubjectStr, 'Quick question');
        detectedSlotIndex = parsed.detectedSlotIndex ?? -1;
      }
    } catch (e) {
      console.error('AI response parsing failed:', e);
      classification = 'Unknown';
      aiSuggestedReplyStr = bookingLink 
        ? `Thanks for getting back to me. Let's connect soon. You can book a time here: ${bookingLink}`
        : `Thanks for getting back to me. Let's schedule a time to speak.`;
    }
  }

  // Auto override for Unsubscribe keywords
  if (isUnsubscribeKeyword) {
    classification = 'Unsubscribe';
    canAutoSend = false;
    shouldReply = false;
  }

  let bookedCall = false;
  let newSuggestedSlots: any[] = [];

  // Google Calendar Integration - Post AI Logic
  if (isCalendarConnected && matchedLead) {
    if (classification === 'Selected slot' && detectedSlotIndex >= 1 && existingSuggestedSlots.length >= detectedSlotIndex) {
      // The AI identified the user selected a slot
      const selectedSlot = existingSuggestedSlots[detectedSlotIndex - 1];
      try {
        await bookCalendarEvent(matchedUser.id, {
          start: selectedSlot.start,
          end: selectedSlot.end,
          summary: `Discovery Call with ${matchedLead.businessName || matchedLead.email}`,
          description: `Booked from Funnelzen AI Campaign: ${matchedCampaign?.name}`,
          attendeeEmail: matchedLead.email || ''
        });
        
        // Mark slot as selected
        await prisma.suggestedCalendarSlot.update({
          where: { id: selectedSlot.id },
          data: { selected: true }
        });

        bookedCall = true;
        classification = 'Booked'; // Override classification
        aiSuggestedReplyStr = `Great, you're booked for ${selectedSlot.label}.\n\nI've sent a calendar invite to ${matchedLead.email}. Looking forward to speaking with you.`;
        canAutoSend = true;
      } catch (err) {
        console.error('Failed to book event automatically', err);
      }
    } else if (['Wants meeting', 'Interested', 'Wants consultation', 'Wants demo'].includes(classification)) {
      // Fetch 3 slots and append to AI reply
      try {
        const start = new Date();
        start.setHours(start.getHours() + 2); // Start looking 2 hours from now
        const end = new Date(start);
        end.setDate(end.getDate() + 7); // Look up to 7 days ahead
        
        availableSlots = await getAvailableSlots(matchedUser.id, {
          dateRangeStart: start,
          dateRangeEnd: end,
          durationMinutes: 30
        });

        if (availableSlots.length > 0) {
          const slotsText = availableSlots.slice(0, 3).map((s, i) => `${i + 1}. ${s.label}`).join('\n');
          aiSuggestedReplyStr = `Perfect — happy to connect.\n\nHere are a few times that are open:\n${slotsText}\n\nWhich one works best for you?`;
          canAutoSend = true; // Safe to auto-send the slots proposal
          newSuggestedSlots = availableSlots.slice(0, 3);
        }
      } catch (err) {
        console.error('Failed to get slots', err);
      }
    }
  }

  // 5. Update Lead / Unsubscribe status
  if (matchedLead) {
    if (classification === 'Unsubscribe') {
      await prisma.lead.update({
        where: { id: matchedLead.id },
        data: { status: 'Unsubscribed' }
      });
      if (matchedLead.email) {
        await prisma.unsubscribeList.upsert({
          where: { userId_email: { userId: matchedUser.id, email: matchedLead.email } },
          update: { reason: 'Inbound reply unsubscribe keyword' },
          create: { userId: matchedUser.id, email: matchedLead.email, reason: 'Inbound reply unsubscribe keyword' }
        });
      }
    } else {
      const isNegative = ['Not interested', 'Already using competitor', 'Negative response', 'Spam'].includes(classification);
      await prisma.lead.update({
        where: { id: matchedLead.id },
        data: { 
          status: bookedCall ? 'Booked' : (isNegative ? 'Not Interested' : 'Replied'),
          leadTier: bookedCall ? 'Converted' : (isNegative ? 'Cold' : 'Hot'),
          leadScore: { increment: 50 }
        }
      });
      if (matchedCampaign) {
        await prisma.campaignLead.updateMany({
          where: { campaignId: matchedCampaign.id, leadId: matchedLead.id },
          data: { status: bookedCall ? 'Booked' : (isNegative ? 'Not Interested' : 'Replied') }
        });
      }
      if (bookedCall) {
        const existingCall = await prisma.bookedCall.findFirst({
          where: {
            userId: matchedUser.id,
            leadId: matchedLead.id,
            status: { in: ['Scheduled', 'Confirmed', 'Booked'] },
          },
        });
        if (!existingCall) {
          await prisma.bookedCall.create({
            data: {
              userId: matchedUser.id,
              leadId: matchedLead.id,
              campaignId: matchedCampaign?.id || null,
              callDate: existingSuggestedSlots[detectedSlotIndex - 1]?.start || new Date(),
              status: 'Booked',
              notes: 'Auto-booked from reply slot selection',
            },
          });
        }
      }
    }
  }

  // 6. Setup auto-send scheduling if allowed
  let aiReplyScheduledAt = null;
  let aiReplyStatus = 'Draft';

  // Fetch global settings
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: matchedUser.id }
  });
  const globalAutoSend = userSettings?.autoSendMode === true;
  const campaignAutoSend = matchedCampaign && matchedCampaign.autoReplyEnabled && matchedCampaign.autoReplyMode === 'auto_send_safe';

  if ((campaignAutoSend || globalAutoSend) && canAutoSend) {
    if (confidence >= 0.85 && classification !== 'Unsubscribe' && classification !== 'Not interested') {
      aiReplyStatus = 'Queued';
      const min = matchedCampaign?.replyDelayMinMinutes ?? 1;
      const max = matchedCampaign?.replyDelayMaxMinutes ?? 2;
      const delayMins = Math.floor(Math.random() * (max - min + 1)) + min;
      aiReplyScheduledAt = new Date(Date.now() + delayMins * 60000);
    }
  }

  // Save the EmailReply record
  const newReply = await prisma.emailReply.create({
    data: {
      userId: matchedUser.id,
      campaignId: matchedCampaign?.id || null,
      leadId: matchedLead?.id || null,
      emailSequenceId: emailSequenceId || null,
      fromEmail: normalizedFrom,
      toEmail: normalizedTo,
      subject: normalizedSubject,
      body: normalizedBody,
      messageId: messageId || null,
      classification,
      confidence,
      shouldReply,
      canAutoSend,
      aiSuggestedReply: aiSuggestedReplyStr,
      aiReplySubject: aiReplySubjectStr,
      aiReplyStatus,
      aiReplyScheduledAt,
      status: 'Unread',
      bookedCall
    }
  });

  // Save new suggested slots to DB attached to this reply
  if (newSuggestedSlots.length > 0 && matchedLead) {
    await prisma.suggestedCalendarSlot.createMany({
      data: newSuggestedSlots.map(s => ({
        replyId: newReply.id,
        userId: matchedUser!.id,
        campaignId: matchedCampaign?.id || null,
        leadId: matchedLead!.id,
        start: s.start,
        end: s.end,
        label: s.label
      }))
    });
  }

  // Inject auto-reply into EmailSequence to be picked up by the sender cron
  if (aiReplyStatus === 'Queued' && aiReplyScheduledAt && matchedUser && matchedCampaign && matchedLead) {
    await prisma.emailSequence.create({
      data: {
        userId: matchedUser.id,
        campaignId: matchedCampaign.id,
        leadId: matchedLead.id,
        sequenceStep: 99, // 99 for reply logic
        subject: aiReplySubjectStr,
        body: aiSuggestedReplyStr.replace(/\n/g, '<br/>'),
        status: 'Queued',
        approvalStatus: 'Approved',
        scheduledAt: aiReplyScheduledAt,
      }
    });
  }

  return {
    success: true,
    matched: !!matchedLead,
    replyId: newReply.id,
    classification,
    aiReplyStatus,
    futureFollowUpsCancelled
  };
}
