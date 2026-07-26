// AI email sequence writer via OpenRouter.
// Writes a unique multi-step outreach sequence per lead using the lead's
// research data. Two parallel tracks with their own structure and tone:
//   Track A — company has active job openings (direct, timely, references roles)
//   Track B — no current openings but future potential (consultative nurture)
// The number of emails per sequence comes from the campaign's emailSequenceCount.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const DEFAULT_SEQUENCE_STEPS = 4;

export interface GeneratedEmail {
  step: number;
  type: string;
  delayDays: number;
  subject: string;
  body: string;
}

export function sequenceStepCount(campaign: { emailSequenceCount?: number | null }): number {
  const n = parseInt(String(campaign?.emailSequenceCount));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : DEFAULT_SEQUENCE_STEPS;
}

export function isHiringTrack(lead: { hiringStatus?: string | null }): boolean {
  return (lead.hiringStatus || '').toLowerCase() === 'hiring';
}

// Cumulative send day per step. Track A moves faster (their roles are open now);
// Track B nurtures over a longer horizon.
function trackDays(hiring: boolean, count: number): number[] {
  const gaps = hiring ? [0, 2, 3, 4] : [0, 4, 5, 7];
  const days: number[] = [];
  let day = 0;
  for (let i = 0; i < count; i++) {
    day += gaps[Math.min(i, gaps.length - 1)];
    days.push(i === 0 ? 0 : day);
  }
  return days;
}

function trackBrief(hiring: boolean, count: number, days: number[]): string {
  const header = hiring
    ? `TRACK A — ACTIVELY HIRING (this company has open job postings right now).
Tone: direct, energetic, timely. Reference their current hiring activity naturally — the way a human who happened to see their job ad would, never like a scraper or bot.`
    : `TRACK B — FUTURE POTENTIAL (no current job openings were found for this company).
Tone: consultative, patient, relationship-first. NEVER claim or imply they are currently hiring. Focus on being useful before they need us.`;

  const roles = hiring
    ? [
        'Intro/Hook referencing their active openings + one-line value proposition.',
        'Short follow-up adding one concrete benefit or proof point.',
        'Address the most likely objection; create gentle urgency while their roles are still open.',
      ]
    : [
        'Warm intro grounded in what their business does; plant the value proposition for when they next need it.',
        'Share a useful, relevant insight for their industry — no hard sell.',
        'Light check-in with soft social proof; suggest a no-pressure intro chat.',
      ];
  const closer = hiring
    ? 'Polite break-up email that leaves the door open.'
    : 'Soft close — invite them to keep us in mind for the future.';

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    let role: string;
    if (i === count - 1 && count > 1) role = closer;
    else if (i < roles.length) role = roles[i];
    else role = `Another short follow-up with a fresh angle — do not repeat earlier emails.`;
    lines.push(`* Email ${i + 1} (Day ${days[i]}): ${role}`);
  }

  return `${header}\nStructure:\n${lines.join('\n')}`;
}

function leadContext(lead: any): string {
  return [
    `Company: ${lead.companyName || lead.businessName || 'Unknown'}`,
    (lead.fullName || lead.firstName) ? `Contact person: ${lead.fullName || lead.firstName}` : null,
    lead.jobTitle ? `Contact role: ${lead.jobTitle}` : null,
    (lead.industry || lead.category) ? `Industry: ${lead.industry || lead.category}` : null,
    lead.location ? `Location: ${lead.location}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.rating ? `Google rating: ${lead.rating} (${lead.reviewCount || 0} reviews)` : null,
    lead.aiInsight ? `AI research insight: ${lead.aiInsight}` : null,
    lead.aiFitReason ? `Fit reason: ${lead.aiFitReason}` : null,
    `Hiring status: ${lead.hiringStatus || 'Unknown'}`,
    lead.hiringSignal ? `Hiring evidence: ${lead.hiringSignal}` : null,
    lead.hiringJobCount ? `Open roles found: ${lead.hiringJobCount}` : null,
  ].filter(Boolean).join('\n');
}

function campaignContext(campaign: any, senderName: string): string {
  return [
    campaign.offer ? `Offer: ${campaign.offer}` : null,
    campaign.goal ? `Campaign goal: ${campaign.goal}` : null,
    campaign.mainBenefit ? `Main benefit: ${campaign.mainBenefit}` : null,
    campaign.problemSolved ? `Problem we solve: ${campaign.problemSolved}` : null,
    campaign.targetAudience ? `Target audience: ${campaign.targetAudience}` : null,
    campaign.proofCaseStudy ? `Proof / case study (only use this, never invent proof): ${campaign.proofCaseStudy}` : 'No proof provided — do NOT invent statistics, client names, or case studies.',
    campaign.tone ? `Preferred tone baseline: ${campaign.tone}` : null,
    campaign.agencyName ? `Our company: ${campaign.agencyName}` : null,
    senderName ? `Sender name (sign emails with this): ${senderName}` : null,
    (campaign.bookingLink || campaign.ctaLink) ? `Booking link for the CTA: ${campaign.bookingLink || campaign.ctaLink}` : null,
    campaign.avoidSaying ? `Never say: ${campaign.avoidSaying}` : null,
  ].filter(Boolean).join('\n');
}

function sanitize(text: string, lead: any): string {
  const first = lead.firstName || (lead.fullName ? String(lead.fullName).trim().split(/\s+/)[0] : '') || 'there';
  const company = lead.companyName || lead.businessName || 'your team';
  return String(text)
    .replace(/\{\{?\s*first[_ ]?name\s*\}?\}/gi, first)
    .replace(/\{\{?\s*(company|business)[_ ]?name\s*\}?\}/gi, company)
    .replace(/\b(undefined|null|NaN)\b/g, '')
    .trim();
}

function extractJson(text: string): any | null {
  const s = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callOpenRouter(prompt: string, maxTokens: number, apiKey: string): Promise<any> {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');

  const model = process.env.OPENROUTER_EMAIL_MODEL || 'openai/gpt-4o-mini';

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://funnelzen.ai',
      'X-Title': 'FunnelZen Email Sequences',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || res.statusText || 'OpenRouter request failed');
  }

  const content: string = data.choices?.[0]?.message?.content || '';
  const parsed = extractJson(content);
  if (!parsed) throw new Error('AI returned unparseable output. Please try again.');
  return parsed;
}

function basePrompt(campaign: any, lead: any, senderName: string, count: number, days: number[]): string {
  const hiring = isHiringTrack(lead);
  return `You are an expert cold-email copywriter. Write a personalized, permission-based B2B outreach email sequence for the specific company below. YOU ARE AN API — RETURN ONLY VALID JSON, no markdown, no explanations.

ABOUT US (the sender):
${campaignContext(campaign, senderName)}

THE PROSPECT (research data — use it for personalization):
${leadContext(lead)}

CAMPAIGN TRACK FOR THIS PROSPECT:
${trackBrief(hiring, count, days)}

Rules:
* Greet with the contact's real first name if one is provided; otherwise use "Hi there,". If the contact name looks like a company name, do not use it as a person's name.
* Every email must be unique to THIS company — weave in at least one concrete detail from the research data.
* Keep each email short (60–120 words), human, and conversational. One clear CTA per email.
* Do not invent facts, statistics, pricing, guarantees, or client names.
* Never output placeholders like {{firstName}} — write final, ready-to-send text.
* Sign each email with the sender name when provided.`;
}

function normalizeEmail(raw: any, lead: any, fallbackStep: number, days: number[], count: number): GeneratedEmail | null {
  if (!raw) return null;
  const lower: any = {};
  for (const k in raw) lower[k.toLowerCase()] = raw[k];

  const step = parseInt(String(lower.step ?? fallbackStep));
  const subject = lower.subject ? sanitize(lower.subject, lead) : '';
  const body = lower.body ? sanitize(lower.body, lead) : '';
  if (!subject || !body || isNaN(step) || step < 1 || step > count) return null;

  const rawDelay = lower.delaydays ?? lower.delay_days;
  const delayDays = Number.isFinite(Number(rawDelay)) && rawDelay !== null && rawDelay !== undefined
    ? Math.max(0, parseInt(String(rawDelay)))
    : days[step - 1] ?? 0;

  return { step, type: String(lower.type || ''), delayDays, subject, body };
}

// Generate the full sequence (all steps) for one lead.
export async function generateSequenceForLead(
  campaign: any,
  lead: any,
  senderName: string,
  count: number,
  openRouterApiKey: string
): Promise<GeneratedEmail[]> {
  const hiring = isHiringTrack(lead);
  const days = trackDays(hiring, count);

  const schemaLines = Array.from({ length: count }, (_, i) =>
    `    { "step": ${i + 1}, "type": "...", "delayDays": ${days[i]}, "subject": "...", "body": "..." }`
  ).join(',\n');

  const prompt = `${basePrompt(campaign, lead, senderName, count, days)}

Generate EXACTLY ${count} emails following the track structure above.

Return ONLY this JSON (lowercase keys):
{
  "emails": [
${schemaLines}
  ]
}`;

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await callOpenRouter(prompt, 700 * count + 500, openRouterApiKey);
      const rawEmails = Array.isArray(parsed?.emails) ? parsed.emails : [];
      const emails = rawEmails
        .map((e: any, i: number) => normalizeEmail(e, lead, i + 1, days, count))
        .filter(Boolean) as GeneratedEmail[];
      if (emails.length > 0) return emails;
      lastError = new Error('AI returned no usable emails.');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Email generation failed.');
}

// Regenerate one step, keeping continuity with the rest of the sequence.
export async function regenerateStepForLead(
  campaign: any,
  lead: any,
  senderName: string,
  step: number,
  count: number,
  existingEmails: { sequenceStep: number; subject: string; body: string }[],
  openRouterApiKey: string
): Promise<GeneratedEmail> {
  const hiring = isHiringTrack(lead);
  const days = trackDays(hiring, count);
  const others = existingEmails
    .filter(e => e.sequenceStep !== step)
    .sort((a, b) => a.sequenceStep - b.sequenceStep)
    .map(e => `Email ${e.sequenceStep} — Subject: ${e.subject}\n${e.body}`)
    .join('\n\n');
  const current = existingEmails.find(e => e.sequenceStep === step);

  const prompt = `${basePrompt(campaign, lead, senderName, count, days)}

The rest of the sequence already written for this prospect (keep continuity, do not repeat their angles):
${others || 'None yet.'}

${current ? `The current version of Email ${step}, which the user rejected — write something clearly DIFFERENT (new angle, new subject):\nSubject: ${current.subject}\n${current.body}` : ''}

Rewrite ONLY Email ${step} of ${count}, following its role in the track structure above.

Return ONLY this JSON (lowercase keys):
{ "step": ${step}, "type": "...", "delayDays": ${days[step - 1] ?? 0}, "subject": "...", "body": "..." }`;

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await callOpenRouter(prompt, 1200, openRouterApiKey);
      const raw = parsed?.emails?.[0] ?? parsed;
      const email = normalizeEmail(raw, lead, step, days, count);
      if (email) return { ...email, step };
      lastError = new Error('AI returned no usable email.');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Email regeneration failed.');
}
