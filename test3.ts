import { loadEnvConfig } from '@next/env';
loadEnvConfig('./');
import { generateAiResponse } from './lib/ai-provider';

async function run() {
  const prompt = `You are an expert email strategist for a professional business introduction.
Write a permission-based outreach email.
YOU ARE AN API. YOU MUST ONLY RETURN JSON.

IMPORTANT:
You must write emails based on the campaign answers and Knowledge Base.
Use the lead's first name and company/business name when available. If missing, use generic terms like "there" or "your company".
Do not invent facts, proof, pricing, guarantees, or results.
If a detail is missing, use safe fallback language. Do not refuse to generate the email.

Instructions:
* Start every email with a personalized greeting.
* IMPORTANT: Analyze the provided 'First name' or 'Full name'. If it contains a company name, a job title, or a mix of names and companies (e.g., "John Doe - Acme Corp"), intelligently extract ONLY the person's actual first name for the greeting (e.g., "Hi John,").
* If it is entirely a company name with no person's name, use a generic greeting like "Hi there,".
* Mention the company/business name naturally when relevant.
* Use the pain point and desired outcome.
* Use knowledge base facts only when available.
* Push toward booking a call.
* Use CTA strategy.
* Keep emails short and human.
* Never output placeholders.
* Never output undefined/null.
* CRITICAL: You MUST output the JSON exactly as requested even if some or all prospect details are missing. DO NOT refuse to generate. Use generic fallback language if a specific detail is missing.
* Return valid JSON only. Do not apologize or ask for more details.

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
  } catch (err: any) {
    console.error('AI ERROR:', err.message);
  }
}

run();
