/**
 * People Data Labs (PDL) client for Find Client Leads.
 *
 * Given agency-set criteria (industry, region/country, company size, roles) this
 * finds decision-makers (HR / Talent Acquisition / Founder) together with their
 * company (name, website, industry, size, location).
 *
 * Plan notes (verified against the live API):
 *  - Person Search returns real name, job title, LinkedIn, and company details.
 *  - PII fields (work_email, emails, mobile_phone) come back as booleans when the
 *    plan lacks PII entitlement. We detect that and fall back to a best-guess
 *    work email derived from the person's name + company domain.
 *  - PDL company data has no phone field, so company phone is not available.
 *
 * Docs: https://docs.peopledatalabs.com/docs/person-search-api
 */

const PDL_BASE_URL = process.env.PDL_BASE_URL || 'https://api.peopledatalabs.com/v5';

export type DecisionMakerRole = 'hr_talent' | 'founders_execs' | 'sales_marketing';

export interface PdlSearchParams {
  industry?: string;        // must be a PDL taxonomy value, e.g. "computer software"
  keywords?: string;        // matched against job title
  location?: string;        // state / region, e.g. "Texas"
  country?: string;         // e.g. "United States"
  companySizes?: string[];  // PDL buckets, e.g. ["1-10","11-50"]
  roles?: DecisionMakerRole[];
  maxResults?: number;
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

function buildQuery(params: PdlSearchParams) {
  const must: object[] = [];

  const region = lc(params.location);
  if (region) must.push({ term: { job_company_location_region: region } });

  const country = lc(params.country);
  if (country) must.push({ term: { job_company_location_country: country } });

  const industry = lc(params.industry);
  if (industry) must.push({ term: { job_company_industry: industry } });

  if (params.companySizes && params.companySizes.length > 0) {
    must.push({ terms: { job_company_size: params.companySizes } });
  }

  // Free-text keywords are matched against the job title (an analyzed field).
  const keywords = lc(params.keywords);
  if (keywords) must.push({ match: { job_title: keywords } });

  const roles = params.roles && params.roles.length > 0
    ? params.roles
    : (['hr_talent', 'founders_execs'] as DecisionMakerRole[]);
  const roleClauses = roles.map((r) => ROLE_CLAUSES[r]).filter(Boolean);

  // PDL rejects `minimum_should_match`, so OR the roles via a nested bool/should
  // inside `must` — which defaults to "at least one must match".
  if (roleClauses.length > 0) {
    must.push({ bool: { should: roleClauses } });
  }

  return { bool: { must } };
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
  const realEmail = realString(p.work_email) || realString(p.recommended_work_email);

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

/**
 * Search PDL for decision-makers matching the criteria.
 * Returns an empty list (not an error) when PDL finds no matches.
 */
export async function searchLeads(apiKey: string, params: PdlSearchParams): Promise<SearchResult> {
  const size = Math.min(Math.max(params.maxResults ?? 25, 1), 100);

  const res = await fetch(`${PDL_BASE_URL}/person/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ query: buildQuery(params), size }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`People Data Labs returned a non-JSON response (${res.status}).`);
  }

  // PDL returns 404 when nothing matches — that's an empty result, not a failure.
  if (res.status === 404) {
    return { leads: [], verifiedEmailsAvailable: false };
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `People Data Labs request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  const people: any[] = Array.isArray(data.data) ? data.data : [];
  const leads = people.map(normalizePerson);
  const verifiedEmailsAvailable = leads.some((l) => l.emailStatus === 'verified');

  const notice = !verifiedEmailsAvailable && leads.length > 0
    ? 'Your People Data Labs plan does not include email addresses, so work emails shown are best-guess patterns (first.last@company-domain). Upgrading to a PDL plan with PII access will return verified emails automatically.'
    : undefined;

  return { leads, verifiedEmailsAvailable, notice };
}
