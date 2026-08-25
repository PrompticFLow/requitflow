/**
 * People Data Labs (PDL) client for Find Client Leads.
 *
 * Given agency-set criteria (industry, region/country, company size, roles) this
 * finds decision-makers (HR / Talent Acquisition / Founder) together with their
 * company (name, website, industry, size, location).
 *
 * Plan notes (verified against the live API):
 *  - Person Search returns real name, job title, LinkedIn, and company details.
 *  - `job_title` is indexed as a keyword, NOT as analyzed text: `match` on it
 *    behaves like an exact match, so "talent" only matched people whose title is
 *    literally "talent" (3.6k records) instead of "…talent acquisition…" (800k).
 *    Title keywords therefore go through `wildcard: *keyword*`.
 *  - `query_string` clauses are rejected by PDL ("Query clause [query] not
 *    allowed"), so multi-keyword search is a bool/should of wildcards.
 *  - Paging uses `scroll_token` (the legacy `from` offset is deprecated and caps
 *    out at 9999). Tokens are forward-only, so the caller keeps them per page.
 *  - PII fields (work_email, emails, mobile_phone) come back as booleans when the
 *    plan lacks PII entitlement. We detect that and fall back to a best-guess
 *    work email derived from the person's name + company domain.
 *  - PDL company data has no phone field, so company phone is not available.
 *  - PDL rate-limits aggressively (429); requests retry with backoff.
 *
 * Docs: https://docs.peopledatalabs.com/docs/person-search-api
 */

const PDL_BASE_URL = process.env.PDL_BASE_URL || 'https://api.peopledatalabs.com/v5';

export type DecisionMakerRole = 'hr_talent' | 'founders_execs' | 'sales_marketing';

/** Upstream PDL failure with the HTTP status we should surface to the client. */
export class PdlApiError extends Error {
  statusCode: number;
  errorType?: string;
  constructor(message: string, statusCode: number, errorType?: string) {
    super(message);
    this.name = 'PdlApiError';
    this.statusCode = statusCode;
    this.errorType = errorType;
  }
}

export interface PdlSearchParams {
  industry?: string;        // must be a PDL taxonomy value, e.g. "computer software"
  keywords?: string;        // comma-separated title keywords, matched as *keyword*
  location?: string;        // state / region, e.g. "Texas"
  country?: string;         // e.g. "United States"
  companySizes?: string[];  // PDL buckets, e.g. ["1-10","11-50"]
  roles?: DecisionMakerRole[];
  /** Page size (1–100). */
  size?: number;
  /** Forward-only cursor returned by the previous page. */
  scrollToken?: string | null;
}

export interface LeadRecord {
  // company
  businessName: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
  companySize: string | null;
  address: string | null;
  companyLinkedin: string | null;
  // decision-maker
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  seniority: string | null;
  linkedinUrl: string | null;
  email: string | null;
  emailStatus: 'verified' | 'guessed' | 'unavailable';
  // meta
  pdlId: string | null;
  raw: any;
}

export interface SearchResult {
  leads: LeadRecord[];
  /** Total records matching the query (not just this page). */
  total: number;
  /** Cursor for the next page; null when there are no further pages. */
  scrollToken: string | null;
  /** The title wildcards actually sent to PDL — surfaced so the UI can show them. */
  appliedTitles: string[];
  /** true when the plan returned at least one real (non-masked) email. */
  verifiedEmailsAvailable: boolean;
  notice?: string;
}

/** PDL role filters, expressed against the fields PDL actually indexes. */
const ROLE_CLAUSES: Record<DecisionMakerRole, object> = {
  hr_talent: { term: { job_title_role: 'human_resources' } },
  founders_execs: { terms: { job_title_levels: ['owner', 'cxo'] } },
  sales_marketing: { terms: { job_title_role: ['sales', 'marketing'] } },
};

/** PDL company-size buckets. */
export const PDL_COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];

/** Common PDL industry taxonomy values (must match exactly — PDL indexes these as keywords). */
export const PDL_INDUSTRIES = [
  'computer software', 'information technology and services', 'internet',
  'marketing and advertising', 'financial services', 'banking', 'insurance',
  'hospital & health care', 'health, wellness and fitness', 'medical devices',
  'staffing and recruiting', 'human resources', 'management consulting',
  'construction', 'real estate', 'retail', 'e-learning', 'education management',
  'automotive', 'logistics and supply chain', 'telecommunications',
  'accounting', 'legal services', 'restaurants', 'hospitality',
  'mechanical or industrial engineering', 'electrical/electronic manufacturing',
  'oil & energy', 'pharmaceuticals', 'nonprofit organization management',
];

/** PDL indexes these values lowercased. */
const lc = (s?: string | null) => (s ? String(s).trim().toLowerCase() : undefined);

/** Common country nicknames → PDL `job_company_location_country` values. */
const COUNTRY_ALIASES: Record<string, string> = {
  uae: 'united arab emirates',
  uk: 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  usa: 'united states',
  us: 'united states',
  america: 'united states',
};

/** Cities often typed into the Country field — search locality + the real country. */
const CITY_COUNTRY: Record<string, string> = {
  dubai: 'united arab emirates',
  'abu dhabi': 'united arab emirates',
  sharjah: 'united arab emirates',
};

function pdlErrorType(err: any): string | undefined {
  const t = err?.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t) && typeof t[0] === 'string') return t[0];
  return undefined;
}

function pdlErrorMessage(data: any, status: number): string {
  const err = data?.error;
  const type = pdlErrorType(err);
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';

  if (status === 402 || type === 'payment_required') {
    return 'People Data Labs search credits are used up. Add more search credits in your People Data Labs account, then try again.';
  }
  if (status === 401 || type === 'authentication_error') {
    return 'People Data Labs API key is missing or invalid.';
  }
  if (status === 429 || type === 'rate_limit_error') {
    return 'People Data Labs rate limit reached. Wait a moment and try again.';
  }
  if (msg) return msg;
  return `People Data Labs request failed (${status})`;
}

/** Title keywords are comma-separated and matched as "contains". */
export function parseTitleKeywords(keywords?: string | null): string[] {
  return (keywords || '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    // A bare "*" would match every title and blow up the result set.
    .filter((k) => k.length > 0 && k.replace(/\*/g, '').length > 0);
}

function buildQuery(params: PdlSearchParams): { query: object; appliedTitles: string[] } {
  const must: object[] = [];

  const region = lc(params.location);
  if (region) must.push({ term: { job_company_location_region: region } });

  const countryInput = lc(params.country);
  if (countryInput) {
    const cityCountry = CITY_COUNTRY[countryInput];
    if (cityCountry) {
      must.push({ term: { job_company_location_locality: countryInput } });
      must.push({ term: { job_company_location_country: cityCountry } });
    } else {
      must.push({
        term: { job_company_location_country: COUNTRY_ALIASES[countryInput] || countryInput },
      });
    }
  }

  const industry = lc(params.industry);
  if (industry) must.push({ term: { job_company_industry: industry } });

  if (params.companySizes && params.companySizes.length > 0) {
    must.push({ terms: { job_company_size: params.companySizes } });
  }

  // job_title is a keyword field, so "talent" has to be searched as *talent*.
  // Several keywords are ORed, letting "talent, recruiter" widen the net.
  const titles = parseTitleKeywords(params.keywords);
  if (titles.length > 0) {
    must.push({
      bool: {
        should: titles.map((t) => ({
          wildcard: { job_title: t.includes('*') ? t : `*${t}*` },
        })),
      },
    });
  }

  const roles = params.roles && params.roles.length > 0
    ? params.roles
    : (['hr_talent', 'founders_execs'] as DecisionMakerRole[]);
  const roleClauses = roles.map((r) => ROLE_CLAUSES[r]).filter(Boolean);

  // PDL rejects `minimum_should_match`, so OR the roles via a nested bool/should
  // inside `must` — which defaults to "at least one must match".
  if (roleClauses.length > 0) {
    must.push({ bool: { should: roleClauses } });
  }

  return { query: { bool: { must } }, appliedTitles: titles };
}

/** PDL masks PII as booleans when the plan lacks entitlement — only strings are real. */
function realString(v: any): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function domainFrom(website: string | null): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return website.replace(/^www\./, '').toLowerCase() || null;
  }
}

/** Best-guess work email (first.last@domain) when the plan doesn't expose the real one. */
function bestGuessEmail(firstName: string | null, lastName: string | null, website: string | null): string | null {
  const domain = domainFrom(website);
  if (!domain || !firstName || !lastName) return null;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const f = clean(firstName);
  const l = clean(lastName);
  if (!f || !l) return null;
  return `${f}.${l}@${domain}`;
}

/**
 * PDL also returns a typed `emails` array. Only an address on the *current*
 * employer's domain is usable — the array also carries previous-employer
 * addresses (e.g. a Brundage Management contact still listing @farmers.com),
 * and emailing those reaches the wrong company.
 */
function professionalEmailFrom(p: any, website: string | null): string | null {
  if (!Array.isArray(p.emails)) return null;
  const domain = domainFrom(website);
  if (!domain) return null;

  const onDomain = p.emails
    .map((e: any) => (typeof e === 'string' ? { address: e, type: null } : e))
    .filter((e: any) => realString(e?.address))
    .find((e: any) => realString(e.address)!.toLowerCase().endsWith(`@${domain}`));

  return onDomain ? realString(onDomain.address) : null;
}

function titleCase(s: string | null): string | null {
  if (!s) return null;
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function withProtocol(site: string | null): string | null {
  if (!site) return null;
  return site.startsWith('http') ? site : `https://${site}`;
}

function normalizePerson(p: any): LeadRecord {
  const firstName = realString(p.first_name);
  const lastName = realString(p.last_name);
  const website = realString(p.job_company_website);

  // work_email is a real string only when the plan includes PII.
  const realEmail =
    realString(p.work_email) ||
    realString(p.recommended_work_email) ||
    professionalEmailFrom(p, website);

  let email: string | null = null;
  let emailStatus: LeadRecord['emailStatus'] = 'unavailable';
  if (realEmail) {
    email = realEmail.toLowerCase();
    emailStatus = 'verified';
  } else {
    const guess = bestGuessEmail(firstName, lastName, website);
    if (guess) {
      email = guess;
      emailStatus = 'guessed';
    }
  }

  const linkedin = realString(p.linkedin_url);
  const companyLinkedin = realString(p.job_company_linkedin_url);
  const levels: string[] = Array.isArray(p.job_title_levels) ? p.job_title_levels : [];

  return {
    businessName: titleCase(realString(p.job_company_name)) || 'Unknown Company',
    website: withProtocol(website),
    phone: null, // PDL company records do not include a phone number.
    industry: titleCase(realString(p.job_company_industry)),
    companySize: realString(p.job_company_size),
    address: titleCase(realString(p.job_company_location_name)),
    companyLinkedin: companyLinkedin ? withProtocol(companyLinkedin) : null,
    fullName: titleCase(realString(p.full_name)),
    firstName: titleCase(firstName),
    lastName: titleCase(lastName),
    jobTitle: titleCase(realString(p.job_title)),
    seniority: levels.length > 0 ? levels.join(', ') : null,
    linkedinUrl: linkedin ? withProtocol(linkedin) : null,
    email,
    emailStatus,
    pdlId: realString(p.id),
    raw: p,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PDL throttles hard on burst traffic; a couple of backed-off retries clears it. */
async function postWithRetry(apiKey: string, body: object, attempts = 3): Promise<{ res: Response; data: any }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(`${PDL_BASE_URL}/person/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      lastError = new PdlApiError(
        `People Data Labs returned a non-JSON response (${res.status}).`,
        res.status >= 400 ? res.status : 502
      );
      data = null;
    }

    if (res.status === 429 && attempt < attempts - 1) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (data === null && attempt < attempts - 1) {
      await sleep(500);
      continue;
    }
    if (data !== null) return { res, data };
  }

  throw lastError || new PdlApiError('People Data Labs request failed.', 502);
}

/**
 * Search PDL for decision-makers matching the criteria.
 * Returns an empty page (not an error) when PDL finds no matches, so the caller
 * can keep paging without special-casing the end of the result set.
 */
export async function searchLeads(apiKey: string, params: PdlSearchParams): Promise<SearchResult> {
  const size = Math.min(Math.max(params.size ?? 25, 1), 100);
  const { query, appliedTitles } = buildQuery(params);

  const body: Record<string, any> = { query, size };
  if (params.scrollToken) body.scroll_token = params.scrollToken;

  const { res, data } = await postWithRetry(apiKey, body);

  // PDL returns 404 when nothing matches — that's an empty result, not a failure.
  if (res.status === 404) {
    return { leads: [], total: 0, scrollToken: null, appliedTitles, verifiedEmailsAvailable: false };
  }

  if (!res.ok) {
    throw new PdlApiError(pdlErrorMessage(data, res.status), res.status, pdlErrorType(data?.error));
  }

  const people: any[] = Array.isArray(data.data) ? data.data : [];
  const leads = people.map(normalizePerson);
  const verifiedEmailsAvailable = leads.some((l) => l.emailStatus === 'verified');

  const notice = !verifiedEmailsAvailable && leads.length > 0
    ? 'Your People Data Labs plan does not include email addresses, so work emails shown are best-guess patterns (first.last@company-domain). Upgrading to a PDL plan with PII access will return verified emails automatically.'
    : undefined;

  return {
    leads,
    total: typeof data.total === 'number' ? data.total : leads.length,
    // PDL drops scroll_token once the result set is exhausted.
    scrollToken: realString(data.scroll_token),
    appliedTitles,
    verifiedEmailsAvailable,
    notice,
  };
}
