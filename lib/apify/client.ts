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

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText) as any;
    error.status = response.status;
    throw error;
  }
  const data = await response.json();

  return data.data;
}

export async function getApifyRun(runId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText) as any;
    error.status = response.status;
    throw error;
  }
  const data = await response.json();

  return data.data;
}

export async function getApifyDatasetItems(datasetId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText) as any;
    error.status = response.status;
    throw error;
  }

  const items = await response.json();
  return items || [];
}

export async function getApifyRunDatasetItems(runId: string) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is missing.");

  const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`);
  
  if (!response.ok) {
    return [];
  }

  const items = await response.json();
  return items || [];
}
