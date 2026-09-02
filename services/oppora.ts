/**
 * Oppora.ai client — people discovery, email finder, email verification, phone lookup.
 *
 * Docs: https://oppora.ai/docs/api  (OpenAPI spec: https://oppora.ai/oppora-openapi.yaml)
 *
 *  - Auth: `Authorization: Bearer opp_live_...`
 *  - Base: https://api.oppora.ai/api/v1/public
 *  - POST /discover/people { title[], departments[], management_levels[], company_industries[], employee_count[], location[], limit, next_cursor }
 *        → { data: Person[], total, next_cursor, has_more, credit_charged, credits_remaining }  flat 10 data credits per non-empty page.
 *  - POST /email/search  { first_name, last_name | full_name, domain }
 *        → { email, status: valid | risky | invalid | unknown, source, credit_charged, credits_remaining }  1 credit only on valid/risky.
 *  - POST /email/verify  { email, mode: "standard" | "advanced" }
 *        → { email, mode, status: valid | invalid | risky | catch-all | unknown, credit_charged, credits_remaining }
 *        standard = 1 data credit, advanced = 2 (deep SMTP + catch-all pass).
 *  - POST /phone/search  { linkedin_url } OR { first_name, last_name | full_name, company | domain }
 *        → { phone, status: valid | invalid | unknown, source, credit_charged, credits_remaining }
 *        Charged only when a phone comes back `valid`; misses are free.
 *  - Errors: { error: { code, message, details? } } with codes invalid_api_key, paid_feature,
 *    insufficient_credits, validation_error, not_found, rate_limit_exceeded, upstream_error, internal_error.
 *  - Rate limit: HTTP 429 with a Retry-After header.
 */

const OPPORA_BASE_URL = (process.env.OPPORA_BASE_URL || 'https://api.oppora.ai/api/v1/public').replace(/\/+$/, '');
/** Email finder / verifier do live SMTP probes, which can stall; never let one request hang a whole batch. */
const REQUEST_TIMEOUT_MS = Number(process.env.OPPORA_TIMEOUT_MS) || 30_000;

/** Oppora verify statuses → the labels the Leads UI already renders. */
const EMAIL_STATUS_LABELS: Record<string, string> = {
  valid: 'Valid',
  invalid: 'Invalid',
  risky: 'Risky',
  'catch-all': 'Catchall',
  catchall: 'Catchall',
  unknown: 'Unknown',
};

export type VerifyMode = 'standard' | 'advanced';

export type VerificationResult = {
  email: string;
  status: string;          // Valid | Invalid | Risky | Catchall | Unknown | Error
  code: string | null;     // raw Oppora status
  creditsRemaining?: number | null;
  error?: string;
};

export type PhoneLookupInput = {
  linkedinUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  company?: string | null;
  domain?: string | null;
};

export type PhoneLookupResult = {
  phone: string | null;
  status: 'Valid' | 'Invalid' | 'NotFound' | 'Error';
  code: string | null;     // raw Oppora status
  source: string | null;
  creditsRemaining?: number | null;
  error?: string;
};

/**
 * Account-level failure (bad key, unpaid plan, exhausted credits, rate limit).
 * Retrying the rest of a batch would just fail the same way, so batches abort on it.
 */
export class OpporaApiError extends Error {
  statusCode: number;
  code?: string;
  retryAfter?: number;
  /** Results a batch had already gathered when this error aborted it. */
  partial?: any[];
  constructor(message: string, statusCode: number, code?: string, retryAfter?: number) {
    super(message);
    this.name = 'OpporaApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
  /** true when the whole batch should stop rather than keep hammering the API. */
  get fatal(): boolean {
    return this.statusCode === 401 || this.statusCode === 402 || this.statusCode === 429;
  }
}

function friendlyMessage(status: number, code?: string, message?: string): string {
  if (status === 401 || code === 'invalid_api_key') return 'Oppora API key is missing or invalid.';
  if (code === 'paid_feature') return 'Oppora API access requires a paid Oppora plan (Pro or Max).';
  if (status === 402 || code === 'insufficient_credits') {
    return 'Oppora credits are used up. Top up credits in your Oppora account, then try again.';
  }
  if (status === 429 || code === 'rate_limit_exceeded') return 'Oppora rate limit reached. Wait a moment and try again.';
  if (message) return message;
  return `Oppora request failed (${status})`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Oppora needs a LinkedIn URL, or a name plus a company/domain, to look up a phone. */
export function hasPhoneIdentity(input: PhoneLookupInput): boolean {
  if (input.linkedinUrl?.trim()) return true;
  const hasName = !!(input.fullName?.trim() || (input.firstName?.trim() && input.lastName?.trim()));
  const hasCompany = !!(input.domain?.trim() || input.company?.trim());
  return hasName && hasCompany;
}

/** Turn a website URL into the bare domain Oppora expects (stripe.com). */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase() || null;
  }
}

/**
 * One POST to Oppora. Retries 429 a couple of times (honouring Retry-After),
 * then throws OpporaApiError for any non-2xx so callers can decide per-item vs. batch-wide handling.
 */
async function post(path: string, apiKey: string, body: object, attempts = 3): Promise<any> {
  let last: OpporaApiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${OPPORA_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      last = new OpporaApiError(
        timedOut ? `Oppora did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s` : err?.message || 'Network error reaching Oppora',
        timedOut ? 504 : 502
      );
      if (attempt < attempts - 1) { await sleep(500 * (attempt + 1)); continue; }
      throw last;
    }

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = null;
    }

    if (res.ok && data !== null) return data;

    // Documented shape is { error: { code, message } }; the live API also emits { detail } on auth failures.
    const code: string | undefined = data?.error?.code;
    const message: string | undefined = data?.error?.message ?? (typeof data?.detail === 'string' ? data.detail : undefined);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      if (attempt < attempts - 1) {
        await sleep(Math.min(Math.max(retryAfter, 1), 10) * 1000 * (attempt + 1));
        continue;
      }
      throw new OpporaApiError(friendlyMessage(429, code, message), 429, code, retryAfter);
    }

    if (data === null) {
      last = new OpporaApiError(`Oppora returned a non-JSON response (${res.status}).`, res.status >= 400 ? res.status : 502);
      if (attempt < attempts - 1) { await sleep(500); continue; }
      throw last;
    }

    throw new OpporaApiError(friendlyMessage(res.status, code, message), res.status, code);
  }

  throw last || new OpporaApiError('Oppora request failed.', 502);
}

/** Verify a single email. Per-item failures come back as status 'Error'; account-level ones throw. */
export async function verifyEmail(
  email: string,
  apiKey: string,
  mode: VerifyMode = 'standard'
): Promise<VerificationResult> {
  try {
    const data = await post('/email/verify', apiKey, { email, mode });
    const raw = typeof data?.status === 'string' ? data.status.toLowerCase() : 'unknown';
    return {
      email,
      status: EMAIL_STATUS_LABELS[raw] ?? 'Unknown',
      code: raw,
      creditsRemaining: typeof data?.credits_remaining === 'number' ? data.credits_remaining : null,
    };
  } catch (err: any) {
    if (err instanceof OpporaApiError && err.fatal) throw err;
    return { email, status: 'Error', code: null, error: err?.message || 'Request failed' };
  }
}

/** Look up a phone number for one person. Per-item failures → status 'Error'; account-level ones throw. */
export async function findPhone(input: PhoneLookupInput, apiKey: string): Promise<PhoneLookupResult> {
  const body: Record<string, string> = {};
  if (input.linkedinUrl?.trim()) body.linkedin_url = input.linkedinUrl.trim();
  if (input.firstName?.trim()) body.first_name = input.firstName.trim();
  if (input.lastName?.trim()) body.last_name = input.lastName.trim();
  if (!body.first_name && input.fullName?.trim()) body.full_name = input.fullName.trim();
  if (input.domain?.trim()) body.domain = input.domain.trim();
  else if (input.company?.trim()) body.company = input.company.trim();

  try {
    const data = await post('/phone/search', apiKey, body);
    const raw = typeof data?.status === 'string' ? data.status.toLowerCase() : 'unknown';
    const phone = typeof data?.phone === 'string' && data.phone.trim() ? data.phone.trim() : null;
    const status: PhoneLookupResult['status'] =
      phone && raw === 'valid' ? 'Valid' : phone && raw === 'invalid' ? 'Invalid' : 'NotFound';
    return {
      phone: status === 'NotFound' ? null : phone,
      status,
      code: raw,
      source: typeof data?.source === 'string' ? data.source : null,
      creditsRemaining: typeof data?.credits_remaining === 'number' ? data.credits_remaining : null,
    };
  } catch (err: any) {
    if (err instanceof OpporaApiError && err.fatal) throw err;
    return { phone: null, status: 'Error', code: null, source: null, error: err?.message || 'Request failed' };
  }
}

/**
 * Run `fn` over `items` with a bounded number of in-flight requests.
 * A fatal OpporaApiError (bad key / no credits / rate-limited) stops the batch and is rethrown;
 * results gathered so far are attached to the error as `partial`.
 */
async function runBatch<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let fatal: OpporaApiError | null = null;

  const worker = async () => {
    while (cursor < items.length && !fatal) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i]);
      } catch (err: any) {
        if (!fatal) fatal = err;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, worker));
  if (fatal) {
    (fatal as OpporaApiError).partial = results;
    throw fatal;
  }
  return results;
}

/** Verify many emails with a bounded number of in-flight requests. */
export function verifyEmails(
  emails: string[],
  apiKey: string,
  mode: VerifyMode = 'standard',
  concurrency = 5
): Promise<VerificationResult[]> {
  return runBatch(emails, (e) => verifyEmail(e, apiKey, mode), concurrency);
}

/** Look up many phone numbers with a bounded number of in-flight requests. */
export function findPhones(
  inputs: PhoneLookupInput[],
  apiKey: string,
  concurrency = 5
): Promise<PhoneLookupResult[]> {
  return runBatch(inputs, (i) => findPhone(i, apiKey), concurrency);
}

// ─── People discovery + email finder (Find Client Leads) ────────────────────

export interface DiscoverPeopleParams {
  /** Free-text job titles, ORed. Fuzzy "contains" match on Oppora's side. */
  titles?: string[];
  /** Exact values from GET /filters/departments. */
  departments?: string[];
  /** Exact values from GET /filters/management-levels. */
  managementLevels?: string[];
  /** Exact values from GET /filters/industries. */
  industries?: string[];
  /** "2-10" | "11-50" | "51-200" | "201-500" | "501-1000" | "1001-5000" | "5001-10000" | "10001+" */
  employeeCounts?: string[];
  /** Person city / state (not country). */
  locations?: string[];
  /** Company HQ city / state. */
  companyHqLocations?: string[];
  /** 1–100, default 25. */
  limit?: number;
  /** Opaque cursor from the previous page. */
  cursor?: string | null;
}

export interface DiscoveredPerson {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  department: string | null;
  managementLevel: string | null;
  linkedinUrl: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companyWebsite: string | null;
  companyLinkedin: string | null;
  companyIndustry: string | null;
  companySize: string | null;
  companyHqCountry: string | null;
  raw: any;
}

export interface DiscoverPeopleResult {
  people: DiscoveredPerson[];
  total: number | null;
  nextCursor: string | null;
  hasMore: boolean;
  creditCharged: number;
  creditsRemaining: number | null;
}

/** Oppora employee-count buckets (the smallest is "2-10", not "1-10"). */
export const OPPORA_EMPLOYEE_COUNTS = ['2-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];

const str = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function withProtocol(site: string | null): string | null {
  if (!site) return null;
  return site.startsWith('http') ? site : `https://${site}`;
}

function normalizePerson(p: any): DiscoveredPerson {
  const experience: any[] = Array.isArray(p?.experience) ? p.experience : [];
  const current = experience.find(e => e?.is_current) || experience[0] || {};
  const loc = p?.location_details || {};
  const companyDomain = str(current.company_domain) || domainFromWebsite(str(current.company_website));

  return {
    firstName: str(p?.first_name),
    lastName: str(p?.last_name),
    fullName: str(p?.full_name),
    jobTitle: str(p?.title) || str(current.title),
    department: str(p?.department) || str(current.department),
    managementLevel: str(p?.management_level) || str(current.management_level),
    linkedinUrl: withProtocol(str(p?.linkedin_url)),
    location: str(p?.location),
    city: str(loc.city),
    state: str(loc.state),
    country: str(loc.country),
    companyName: str(current.company_name),
    companyDomain,
    companyWebsite: withProtocol(str(current.company_website) || companyDomain),
    companyLinkedin: withProtocol(str(current.company_linkedin_url)),
    companyIndustry: str(current.company_industry),
    companySize: str(current.company_employee_count),
    companyHqCountry: str(current.company_hq_country),
    raw: p,
  };
}

/**
 * Search Oppora's people database. Flat 10 data credits per page that returns
 * results; nothing charged for an empty page. Throws OpporaApiError on failure.
 */
export async function discoverPeople(apiKey: string, params: DiscoverPeopleParams): Promise<DiscoverPeopleResult> {
  const body: Record<string, any> = {
    limit: Math.min(Math.max(params.limit ?? 25, 1), 100),
  };
  const arr = (v?: string[]) => (v && v.length ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : null);
  const titles = arr(params.titles);
  const departments = arr(params.departments);
  const levels = arr(params.managementLevels);
  const industries = arr(params.industries);
  const sizes = arr(params.employeeCounts);
  const locations = arr(params.locations);
  const hq = arr(params.companyHqLocations);
  if (titles) body.title = titles;
  if (departments) body.departments = departments;
  if (levels) body.management_levels = levels;
  if (industries) body.company_industries = industries;
  if (sizes) body.employee_count = sizes;
  if (locations) body.location = locations;
  if (hq) body.company_hq_location = hq;
  if (params.cursor) body.next_cursor = params.cursor;

  const data = await post('/discover/people', apiKey, body);
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];

  return {
    people: rows.map(normalizePerson),
    total: typeof data?.total === 'number' ? data.total : null,
    nextCursor: str(data?.next_cursor),
    hasMore: !!data?.has_more && rows.length > 0,
    creditCharged: typeof data?.credit_charged === 'number' ? data.credit_charged : 0,
    creditsRemaining: typeof data?.credits_remaining === 'number' ? data.credits_remaining : null,
  };
}

export type EmailLookupInput = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  /** Company website domain, e.g. "stripe.com". Required by Oppora. */
  domain?: string | null;
};

export type EmailLookupResult = {
  email: string | null;
  status: 'Valid' | 'Risky' | 'Invalid' | 'NotFound' | 'Error';
  code: string | null;
  source: string | null;
  creditsRemaining?: number | null;
  error?: string;
};

/** Oppora needs a name plus the company domain to find an email. */
export function hasEmailIdentity(input: EmailLookupInput): boolean {
  const hasName = !!(input.fullName?.trim() || (input.firstName?.trim() && input.lastName?.trim()));
  return hasName && !!input.domain?.trim();
}

/**
 * Find a work email from name + company domain. 1 data credit only when the
 * result is `valid` or `risky`; misses are free. Per-item failures → 'Error'; account-level ones throw.
 */
export async function findEmail(input: EmailLookupInput, apiKey: string): Promise<EmailLookupResult> {
  const body: Record<string, string> = { domain: (input.domain || '').trim() };
  if (input.firstName?.trim()) body.first_name = input.firstName.trim();
  if (input.lastName?.trim()) body.last_name = input.lastName.trim();
  if (!body.first_name && input.fullName?.trim()) body.full_name = input.fullName.trim();

  try {
    const data = await post('/email/search', apiKey, body);
    const raw = typeof data?.status === 'string' ? data.status.toLowerCase() : 'unknown';
    const email = str(data?.email)?.toLowerCase() || null;
    let status: EmailLookupResult['status'] = 'NotFound';
    if (email && raw === 'valid') status = 'Valid';
    else if (email && raw === 'risky') status = 'Risky';
    else if (email && raw === 'invalid') status = 'Invalid';
    return {
      email: status === 'Valid' || status === 'Risky' ? email : null,
      status,
      code: raw,
      source: str(data?.source),
      creditsRemaining: typeof data?.credits_remaining === 'number' ? data.credits_remaining : null,
    };
  } catch (err: any) {
    if (err instanceof OpporaApiError && err.fatal) throw err;
    return { email: null, status: 'Error', code: null, source: null, error: err?.message || 'Request failed' };
  }
}

/** Find many emails with a bounded number of in-flight requests. */
export function findEmails(inputs: EmailLookupInput[], apiKey: string, concurrency = 10): Promise<EmailLookupResult[]> {
  return runBatch(inputs, (i) => findEmail(i, apiKey), concurrency);
}

/** Remaining credit pools (data, email finder, phone, …), so the UI can warn before burning a batch. */
export async function getCredits(apiKey: string): Promise<any> {
  const res = await fetch(`${OPPORA_BASE_URL}/credits`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new OpporaApiError(
      friendlyMessage(res.status, data?.error?.code, data?.error?.message ?? data?.detail),
      res.status,
      data?.error?.code
    );
  }
  return data;
}
