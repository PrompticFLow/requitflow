// Hiring research via OpenRouter using Perplexity Sonar (a web-search-grounded model).
// For each lead it searches careers pages, LinkedIn Jobs, and job boards to decide
// whether the business currently appears to be hiring.

export type HiringVerdict = 'Hiring' | 'Not Hiring' | 'Unknown';

export interface HiringResult {
  status: HiringVerdict;
  signal: string | null;     // one-line evidence, e.g. "3 open roles on LinkedIn Jobs"
  sourceUrl: string | null;  // careers page / LinkedIn jobs URL / job board listing
  jobCount: number | null;   // number of openings found, if determinable
  error?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function researchHiring(lead: {
  businessName: string;
  website?: string | null;
  category?: string | null;
  country?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
}): Promise<HiringResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { status: 'Unknown', signal: null, sourceUrl: null, jobCount: null, error: 'OPENROUTER_API_KEY is not configured.' };
  }

  const model = process.env.OPENROUTER_HIRING_MODEL || 'perplexity/sonar';

  const context = [
    `Business name: ${lead.businessName}`,
    lead.website ? `Website: ${lead.website}` : null,
    lead.category ? `Industry/Category: ${lead.category}` : null,
    lead.location ? `Location: ${lead.location}` : null,
    lead.country ? `Country: ${lead.country}` : null,
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are a recruiting intelligence researcher. Determine whether this specific company is CURRENTLY hiring (any open job posting counts, even a single role).

${context}

Search the web for evidence, checking in this order:
1. The company's own careers/jobs page (e.g. website + /careers, /jobs, /join-us).
2. Their LinkedIn company page and LinkedIn Jobs listings.
3. Job boards (Indeed, Glassdoor, ZipRecruiter, Google Jobs) for postings by this exact company.

Be careful to match the EXACT company (use the website domain and location to disambiguate similarly named businesses). Only count postings that appear active/recent (within the last ~60 days). If you cannot find the company at all or cannot tell, answer UNKNOWN — do not guess.

Respond with ONLY this JSON, no prose, no markdown fences:
{
  "hiring": "HIRING" | "NOT_HIRING" | "UNKNOWN",
  "jobCount": <number of open roles found, or null>,
  "signal": "<one short sentence of concrete evidence, e.g. '4 open roles listed on their careers page' or 'No active postings found on LinkedIn or Indeed'>",
  "sourceUrl": "<direct URL of the strongest evidence (careers page, LinkedIn jobs page, or job board listing), or null>"
}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://funnelzen.ai',
        'X-Title': 'FunnelZen Hiring Research',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 600,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error?.message || res.statusText || 'OpenRouter request failed';
      return { status: 'Unknown', signal: null, sourceUrl: null, jobCount: null, error: msg };
    }

    const content: string = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed) {
      return { status: 'Unknown', signal: null, sourceUrl: null, jobCount: null, error: 'Model returned unparseable output.' };
    }

    const verdictRaw = String(parsed.hiring || '').toUpperCase();
    const status: HiringVerdict =
      verdictRaw === 'HIRING' ? 'Hiring' :
      verdictRaw === 'NOT_HIRING' ? 'Not Hiring' :
      'Unknown';

    const jobCount = Number.isFinite(Number(parsed.jobCount)) && parsed.jobCount !== null
      ? Math.max(0, Math.round(Number(parsed.jobCount)))
      : null;

    return {
      status,
      signal: typeof parsed.signal === 'string' && parsed.signal.trim() ? parsed.signal.trim().slice(0, 300) : null,
      sourceUrl: sanitizeUrl(parsed.sourceUrl),
      jobCount,
    };
  } catch (err: any) {
    return { status: 'Unknown', signal: null, sourceUrl: null, jobCount: null, error: err?.message || 'Hiring research failed' };
  }
}

function extractJson(text: string): any | null {
  let s = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  return v.slice(0, 500);
}
