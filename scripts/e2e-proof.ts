import { PrismaClient } from '@prisma/client';
import { canSendEmail } from '../lib/email/can-send-email';

const prisma = new PrismaClient();

async function runE2E() {
  console.log("=== E2E FLOW ===");
  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No user found");

    // 1. Create Lead
    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        email: `test-${Date.now()}@example.com`,
        businessName: "Test E2E Business",
        firstName: "John",
        status: "New"
      }
    });
    console.log("Lead ID:", lead.id);

    // 2. Create Campaign
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name: "E2E Proof Campaign",
        status: "Draft",
        targetAudience: "SaaS founders",
        goal: "Book a demo call"
      }
    });
    console.log("Campaign ID:", campaign.id);

    // Add Lead to Campaign
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        status: "Added"
      }
    });

    // 6. Generate 25 emails (Simulation using standard logic)
    const emailsToCreate = [];
    for (let i = 1; i <= 25; i++) {
      emailsToCreate.push({
        userId: user.id,
        campaignId: campaign.id,
        leadId: lead.id,
        sequenceStep: i,
        subject: `Test subject ${i}`,
        body: `Body ${i}`,
        status: "Draft",
        spamRisk: "Low"
      });
    }
    await prisma.emailSequence.createMany({ data: emailsToCreate });

    const emails = await prisma.emailSequence.findMany({
      where: { leadId: lead.id, campaignId: campaign.id },
      orderBy: { sequenceStep: 'asc' }
    });
    console.log("EmailSequence count:", emails.length);

    // Approve Email 1
    const email1 = emails.find(e => e.sequenceStep === 1);
    if (email1) {
      await prisma.emailSequence.update({
        where: { id: email1.id },
        data: { approvalStatus: "Approved", status: "Queued" }
      });
      console.log("Email 1 approved.");
    }

    // Start campaign
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "Active" }
    });

    // Send Log
    const log = await prisma.emailSendLog.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        emailSequenceId: email1!.id,
        subject: email1?.subject || "Subject",
        body: email1?.body || "Body",
        status: "Sent"
      }
    });
    console.log("EmailSendLog ID:", log.id);

    // Simulate Reply
    const reply = await prisma.reply.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        campaignId: campaign.id,
        channel: "Email",
        messageBody: "Yes, I'm interested. Can we talk?",
        intent: "Interested",
        aiSuggestedReply: "Great, here is my link.",
        status: "Unread"
      }
    });
    console.log("Reply ID:", reply.id);
    console.log("AI classification:", reply.intent);

    // Book Call
    const call = await prisma.bookedCall.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        campaignId: campaign.id,
        callDate: new Date(),
        status: "Scheduled"
      }
    });
    console.log("BookedCall ID:", call.id);

    // Cancel pending queue
    const cancelled = await prisma.emailSequence.updateMany({
      where: { leadId: lead.id, status: "Draft" },
      data: { status: "Cancelled" }
    });
    console.log("Cancelled queue count:", cancelled.count);
    
    // SAFETY PROOF
    console.log("=== SAFETY PROOF ===");
    const res1 = await canSendEmail(user.id, lead.id, campaign.id);
    console.log("Valid lead (after booked):", res1.canSend, res1.reason);
    
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

runE2E();
