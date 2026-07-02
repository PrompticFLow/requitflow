import { prisma } from './prisma';
import { generateAiResponse } from './ai-provider';
import { getAvailableSlots, bookCalendarEvent } from './google-calendar';

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
  let matchedLead = null;
  let matchedCampaign = null;
  let matchedUser = null;
  let matchedSequence = null;

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

  // Priority C: campaignId + leadId if provided
  if (!matchedLead && campaignId && leadId) {
    matchedLead = await prisma.lead.findFirst({
      where: { id: leadId, campaignId },
      include: { campaign: true, user: true }
    });
    if (matchedLead) {
      matchedCampaign = matchedLead.campaign;
      matchedUser = matchedLead.user;
    }
  }

  // Priority D: fromEmail + lead email + active campaign
  if (!matchedLead) {
    matchedLead = await prisma.lead.findFirst({
      where: {
        email: { equals: normalizedFrom, mode: 'insensitive' },
        campaign: { status: 'Active' }
      },
      include: { campaign: true, user: true }
    });
    if (matchedLead) {
      matchedCampaign = matchedLead.campaign;
      matchedUser = matchedLead.user;
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

  // Keywords check for Unsubscribe
  const lowerText = normalizedBody.toLowerCase();
  const unsubWords = ['unsubscribe', 'remove me', 'stop emailing', 'opt out', 'take me off', 'do not contact', 'stop'];
  const isUnsubscribeKeyword = unsubWords.some(w => lowerText.includes(w));

  let classification = 'Unknown';
  let confidence = 0.5;
  let shouldReply = false;
  let canAutoSend = false;
  let aiSuggestedReplyStr = '';
  let aiReplySubjectStr = normalizedSubject ? `Re: ${normalizedSubject}` : 'Re: Quick question';
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
    const prompt = `You are an AI sales assistant for a recruitment agency or company outreach campaign.
Analyze the following email reply from a lead and return a JSON object.

Campaign Settings:
- Target Audience: ${matchedCampaign.targetAudience || 'Professionals'}
- Campaign Goal: ${matchedCampaign.goal || 'Book discovery call'}
- Booking Link: ${bookingLink || 'None'}
- Calendar Connected: ${isCalendarConnected ? 'Yes' : 'No'}

Lead Details:
- Name: ${matchedLead.businessName || 'Business Owner'}
- Email: ${matchedLead.email}

Lead Reply:
"${normalizedBody}"

Previously Suggested Times (if any):
${existingSuggestedSlots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}

Rules for response:
- Triage the reply into EXACTLY one of: Interested, Wants more information, Asked for pricing, Wants booking, Selected slot, Objection, Not interested, Unsubscribe, Angry, Out of office, Bounce, Unknown.
- If the user agreed to or selected one of the "Previously Suggested Times", triage as "Selected slot" and provide the 1-based index in "detectedSlotIndex".
- If Calendar Connected is Yes and they want to book, DO NOT include the booking link. Instead, we will inject real slots later.
- If Calendar Connected is No, include the booking link (URL: "${bookingLink}") if they are interested or want booking.
- Keep the response short, human, polite.
- Set "canAutoSend": true ONLY if they are Interested or Want booking (and we have a booking link) OR if they Selected slot.

Format your output as valid JSON matching this schema exactly:
{
  "classification": "Interested",
  "confidence": 0.9,
  "shouldReply": true,
  "canAutoSend": false,
  "stopFollowUps": true,
  "bookCallGoal": true,
  "detectedSlotIndex": -1,
  "subject": "Re: ${normalizedSubject || 'Quick question'}",
  "body": "Thanks for getting back to me. Happy to share more..."
}`;

    try {
      const aiResponse = await generateAiResponse(prompt);
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
        aiSuggestedReplyStr = parsed.body || '';
        aiReplySubjectStr = parsed.subject || aiReplySubjectStr;
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
    } else if (['Wants booking', 'Interested'].includes(classification)) {
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
      await prisma.lead.update({
        where: { id: matchedLead.id },
        data: { status: bookedCall ? 'Booked' : 'Replied' }
      });
      if (matchedCampaign) {
        await prisma.campaignLead.updateMany({
          where: { campaignId: matchedCampaign.id, leadId: matchedLead.id },
          data: { status: bookedCall ? 'Booked' : 'Replied' }
        });
      }
    }
  }

  // 6. Setup auto-send scheduling if allowed
  let aiReplyScheduledAt = null;
  let aiReplyStatus = 'Draft';

  if (matchedCampaign && matchedCampaign.autoReplyEnabled && matchedCampaign.autoReplyMode === 'auto_send_safe' && canAutoSend && matchedCampaign.bookingLink) {
    if (['Interested', 'Wants more information', 'Wants booking'].includes(classification) && confidence >= 0.85 && classification !== 'Unsubscribe') {
      aiReplyStatus = 'Queued';
      const min = matchedCampaign.replyDelayMinMinutes || 3;
      const max = matchedCampaign.replyDelayMaxMinutes || 12;
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

  return {
    success: true,
    matched: !!matchedLead,
    replyId: newReply.id,
    classification,
    aiReplyStatus,
    futureFollowUpsCancelled
  };
}
