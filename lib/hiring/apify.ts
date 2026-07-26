/**
 * Apify REST API client for Companies Hiring sync.
 * Actor IDs like "owner/actor-name" must be URL-encoded as "owner~actor-name"
 * for the Apify REST API v2 /acts/ endpoint.
 */

/**
 * Build actor input based on source and search params.
 * Each actor may expect different field names.
 */
function buildLinkedInSearchUrl(keyword: string, location: string): string {
  // Builds a LinkedIn Jobs search URL from keyword + location
  // curious_coder/linkedin-jobs-scraper requires an array of LinkedIn search page URLs
  const base = 'https://www.linkedin.com/jobs/search/';
  const params = new URLSearchParams();
  if (keyword) params.set('keywords', keyword);
  if (location) params.set('location', location);
  params.set('f_TPR', 'r604800'); // posted in last 7 days
  return `${base}?${params.toString()}`;
}

function buildActorInput(source: string, keyword: string, location: string, country: string, maxResults: number): Record<string, any> {
  switch (source) {
    case 'linkedin':
      // curious_coder/linkedin-jobs-scraper — REQUIRES "urls" (array of LinkedIn search URLs)
      return {
        urls: [buildLinkedInSearchUrl(keyword, location)],
        count: maxResults,
        scrapeCompany: false,
      };

    case 'indeed':
      // orgupdate/indeed-jobs-scraper — REQUIRES "includeKeyword"
      return {
        includeKeyword: keyword,
        locationName: location || undefined,
        countryName: country || undefined,
        pagesToFetch: Math.ceil(maxResults / 15), // ~15 results per page
      };

    case 'google_jobs':
      // orgupdate/google-jobs-scraper — uses "includeKeyword" + "locationName"
      return {
        includeKeyword: keyword,
        locationName: location || undefined,
        maxResults: maxResults,
        language: 'en',
      };

    case 'remote_jobs':
      // orgupdate/remote-co-jobs-scraper
      // NOTE: Do NOT use "maxItems" as a body field — Apify treats it as a platform-level
      // billing cap and throws "max-items-must-be-greater-than-zero" if it conflicts.
      // The limit is set via the URL query param instead (see runApifyActor below).
      return {
        includeKeyword: keyword,
        maxCrawledPages: Math.ceil(maxResults / 10), // ~10 results per page
      };

    case 'world_jobs':
      // automation-lab/multi-ats-jobs-scraper requires specific company ATS domains.
      // It is not suitable for broad keyword searches without a company list.
      // Until a proper company list is configured, this source is not supported for general search.
      throw new Error('World Jobs source requires a configured list of company ATS domains. Please use LinkedIn, Indeed, or Google Jobs instead.');

    default:
      return { keyword, location, country, maxResults };
  }
}

export async function runApifyActor(source: string, keyword: string, location: string, country: string, maxResults: number, token?: string): Promise<any[]> {
  const resolvedToken = token || process.env.APIFY_API_TOKEN;
  if (!resolvedToken) {
    throw new Error('Apify is not connected. Add APIFY_API_TOKEN in environment variables.');
  }

  let actorId = '';
  switch (source) {
    case 'linkedin':
      actorId = process.env.APIFY_LINKEDIN_JOBS_ACTOR || '';
      break;
    case 'indeed':
      actorId = process.env.APIFY_INDEED_JOBS_ACTOR || '';
      break;
    case 'google_jobs':
      actorId = process.env.APIFY_GOOGLE_JOBS_ACTOR || '';
      break;
    case 'remote_jobs':
      actorId = process.env.APIFY_REMOTE_JOBS_ACTOR || '';
      break;
    case 'world_jobs':
      actorId = process.env.APIFY_WORLD_JOBS_ACTOR || '';
      break;
    default:
      throw new Error('Invalid Apify source selected.');
  }

  if (!actorId) {
    throw new Error('Apify actor is not configured for this source.');
  }

  // Apify REST API requires "owner/actor-name" → "owner~actor-name" in the URL
  const encodedActorId = actorId.replace('/', '~');

  // Safety guard: maxResults must always be >= 1
  const safeMaxResults = Math.max(1, Math.floor(maxResults));

  const input = buildActorInput(source, keyword, location, country, safeMaxResults);

  // Start the actor run.
  // maxItems is passed as a URL query param (Apify v2 REST API platform-level cap).
  // This prevents the "max-items-must-be-greater-than-zero" 400 error.
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${encodedActorId}/runs?maxItems=${safeMaxResults}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolvedToken}`
      },
      body: JSON.stringify(input)
    }
  );

  if (!runResponse.ok) {
    const errText = await runResponse.text().catch(() => '');
    throw new Error(`Apify run failed with status: ${runResponse.status}${errText ? ` — ${errText.slice(0, 300)}` : ''}`);
  }

  const runData = await runResponse.json();
  const runId: string = runData?.data?.id;

  if (!runId) {
    throw new Error('Apify did not return a run ID. Check actor input format.');
  }

  // Poll for completion — max 5 minutes (60 × 5s)
  const maxAttempts = 60;
  let attempts = 0;
  let datasetId = '';

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;

    const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${resolvedToken}` }
    });

    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json();
    const status: string = statusData?.data?.status;

    if (status === 'SUCCEEDED') {
      datasetId = statusData.data.defaultDatasetId;
      break;
    } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify job sync failed with status: ${status}. Please check actor input configuration.`);
    }
    // RUNNING or READY — keep polling
  }

  if (!datasetId) {
    throw new Error('Apify job sync timed out after 5 minutes. Try reducing maxResults.');
  }

  // Fetch dataset items
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?limit=${safeMaxResults}`,
    { headers: { 'Authorization': `Bearer ${resolvedToken}` } }
  );

  if (!datasetResponse.ok) {
    throw new Error(`Failed to fetch Apify dataset: ${datasetResponse.status}`);
  }

  const items = await datasetResponse.json();
  return Array.isArray(items) ? items : [];
}
