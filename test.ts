const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const campaign = await prisma.campaign.findFirst({
    include: { leads: true }
  });

  if (!campaign) {
    console.log('No campaign found');
    return;
  }
  
  if (campaign.leads.length === 0) {
    console.log('No leads found for campaign');
    return;
  }
  
  console.log('Campaign ID:', campaign.id);
  console.log('Lead ID:', campaign.leads[0].id);
  
  // Call API manually bypassing auth by creating a direct fake request object or just directly invoking the handler.
  // Actually, I can just use fetch and the server is running on :3000. But I don't have cookies.
  // Wait, I can just call generateAiResponse from here to see if the AI throws!
  const { generateAiResponse } = require('./lib/ai-provider');
  const prompt = `You are an expert email strategist for a professional business introduction.
Write a personalized 5-email permission-based outreach sequence for the following prospect.

[EMAIL SEQUENCE STRUCTURE]
Generate EXACTLY 1 email (Email 1: Introduction / Hook).
The delay for the first email is 0.

You MUST strictly follow this funnel structure:
* Email 1 (Day 0): Introduction / Hook

Return ONLY valid JSON. Do not include markdown. Do not include explanations. Use lowercase keys only.

{
"emails": [
{
"step": 1,
"type": "Intro",
"delayDays": 0,
"subject": "Quick question",
"body": "Hi there, ...",
"spamRisk": "Low",
"spamIssues": "None",
"personalizationReason": "Mentioned their specific pain point."
}
]
}

If the model cannot generate, return: {"emails": []}`;

  try {
    console.log('Testing AI Provider generation...');
    const result = await generateAiResponse(prompt);
    console.log('AI Response:', result);
  } catch (err) {
    console.error('AI ERROR:', err.message);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
