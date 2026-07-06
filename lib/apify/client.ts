/**
 * Helper client to interact with Apify API.
 */

// Replace slash with tilde for Apify API path (e.g. harvestapi/linkedin-profile-scraper -> harvestapi~linkedin-profile-scraper)
function formatActorId(actorId: string): string {
  return actorId.replace('/', '~');
}

export async function startApifyActorRun(actorId: string, input: any) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const formattedActorId = formatActorId(actorId);
  
  const response = await fetch(`https://api.apify.com/v2/acts/${formattedActorId}/runs?token=${token}`, {
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

export async function getApifyRun(runId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  
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

export async function getApifyDatasetItems(datasetId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
  
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

export async function getApifyRunDatasetItems(runId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`);
  
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
