async function main() {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.PERSON_BULK_SEARCH_ACTOR_ID || "powerai/linkedin-peoples-search-scraper";
  const actorPath = actorId.replace("/", "~");

  console.log("Fetching recent runs for", actorPath);
  const runsRes = await fetch(`https://api.apify.com/v2/acts/${actorPath}/runs?token=${token}&desc=1&limit=5`);
  const runsData = await runsRes.json();

  const latestSuccess = runsData.data?.items?.find((r: any) => r.status === "SUCCEEDED");
  if (!latestSuccess) {
    console.log("❌ No successful runs found.");
    return;
  }

  const runId = latestSuccess.id;
  console.log("✅ Found latest successful run:", runId);
  console.log("Default Dataset ID:", latestSuccess.defaultDatasetId);

  console.log("\nTesting check-run API...");
  const localRes = await fetch(`http://localhost:3000/api/apify/person-leads/check-run?runId=${runId}`);
  const text = await localRes.text();
  
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.log("❌ check-run returned non-JSON:", text.slice(0, 500));
    return;
  }

  console.log("Check-Run Result:", {
    success: json.success,
    status: json.status,
    rawCount: json.rawCount,
    imported: json.imported,
    valid: json.valid,
    needsReview: json.needsReview,
    invalid: json.invalid,
    saved: json.saved,
    saveErrors: json.saveErrors,
    leadsReturned: json.leads?.length,
  });

  if (json.leads && json.leads.length > 0) {
    console.log("\nFirst Normalized Lead:", JSON.stringify(json.leads[0], null, 2));
  }
}

main().catch(console.error);
