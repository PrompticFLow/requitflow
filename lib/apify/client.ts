/**
 * Helper client to interact with Apify API.
 */

// Replace slash with tilde for Apify API path (e.g. harvestapi/linkedin-profile-scraper -> harvestapi~linkedin-profile-scraper)
function formatActorId(actorId: string): string {
  return actorId.replace('/', '~');
}

function resolveToken(token?: string): string {
  const resolved = (token || process.env.APIFY_API_TOKEN || '').trim();
  if (!resolved) throw new Error('APIFY_API_TOKEN is missing.');
  return resolved;
}

export async function startApifyActorRun(actorId: string, input: any, token?: string) {
  const apiToken = resolveToken(token);
  const formattedActorId = formatActorId(actorId);

  const response = await fetch(`https://api.apify.com/v2/acts/${formattedActorId}/runs?token=${apiToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  const text = await response.text();
  if (!text) throw new Error("Empty Apify response");

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Apify returned non-JSON (likely HTML error page)");
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "Apify request failed");
  }

  return data.data;
}

export async function getApifyRun(runId: string, token?: string) {
  const apiToken = resolveToken(token);

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiToken}`);

  const text = await response.text();
  if (!text) throw new Error("Empty Apify response");

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Apify returned non-JSON (likely HTML error page)");
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "Apify request failed");
  }

  return data.data;
}

export async function getApifyDatasetItems(datasetId: string, token?: string) {
  const apiToken = resolveToken(token);

  const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiToken}`);

  const text = await response.text();
  if (!text) throw new Error("Empty Apify response");

  console.log("APIFY RAW RESPONSE:", text.slice(0, 500) + "..."); // Add debug logging

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Apify returned non-JSON (likely HTML error page)");
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "Apify request failed");
  }

  return data || [];
}

export async function getApifyRunDatasetItems(runId: string, token?: string) {
  const apiToken = resolveToken(token);

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiToken}`);

  const text = await response.text();
  if (!text) return [];

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Apify returned non-JSON (likely HTML error page)");
  }

  if (!response.ok) {
    return [];
  }

  return data || [];
}
