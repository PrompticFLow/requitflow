const prisma = require('../lib/prisma');
const { sendN8nWebhook } = require('./n8nService');

async function generatePersonalizedEmail(campaignLeadId) {
  try {
    const campaignLead = await prisma.campaignLead.findUnique({
      where: { id: campaignLeadId },
      include: {
        lead: true,
        campaign: { include: { targetAudience: true, user: true } }
      }
    });

    if (!campaignLead) throw new Error('Campaign lead not found');

    const lead = campaignLead.lead;
    const campaign = campaignLead.campaign;
    const user = campaign.user;
    const targetAudience = campaign.targetAudience || {};

    let maxAiEmails = 10;
    if (user.plan === 'Starter') maxAiEmails = 300;
    if (user.plan === 'Pro') maxAiEmails = 2000;
    if (user.plan === 'Agency') maxAiEmails = 7000;

    if (user.aiEmailsThisMonth >= maxAiEmails) {
      throw new Error('AI email generation limit reached for your plan.');
    }

    const openRouterKey = user.openRouterKey || process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!openRouterKey) {
      throw new Error('OpenRouter API key not configured for this user.');
    }

    const prompt = `
You are an expert B2B copywriter. Write a highly personalized, short, and human-sounding cold email for this lead.

LEAD DETAILS:
Name: ${lead.name}
Company: ${lead.company || 'Unknown'}
Job Title/Role: ${lead.source || 'Professional'}
LinkedIn: ${lead.linkedin || 'Unknown'}

TARGET AUDIENCE & CAMPAIGN DETAILS:
Audience Industry: ${targetAudience.industry || 'General'}
Audience Pain Points: ${targetAudience.painPoints || 'Needs more efficiency and growth'}
Campaign Goal: ${campaign.goal || 'Book a discovery call'}

USER DETAILS:
Sender Name: ${user.email} (or use general name)

REQUIREMENTS:
1. Subject line should be catchy and 2-5 words.
2. Body should be max 4-5 short sentences.
4. Output JSON strictly in this format:
{
  "subject": "The suggested subject",
  "body": "The email body text here"
}
`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        response_format: { type: "json_object" },
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const resultText = data.choices[0].message.content;
    const parsed = JSON.parse(resultText);

    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: {
        generatedSubject: parsed.subject,
        generatedBody: parsed.body,
        status: 'generated'
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { aiEmailsThisMonth: { increment: 1 } }
    });

    await sendN8nWebhook(user, 'email_generated', {
      campaign_id: campaign.id,
      lead_id: lead.id,
      lead: lead,
      subject: parsed.subject,
      body: parsed.body,
      status: 'generated'
    });

    return parsed;
  } catch (error) {
    console.error('AI Generation Error:', error);
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { status: 'failed' }
    });
    throw error;
  }
}

module.exports = {
  generatePersonalizedEmail
};
