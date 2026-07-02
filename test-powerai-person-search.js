async function main() {
  const token = process.env.APIFY_API_TOKEN;
  const actorId =
    process.env.PERSON_BULK_SEARCH_ACTOR_ID ||
    process.env.PERSON_VALID_LEADS_ACTOR_ID;

  console.log("Has token:", Boolean(token));
  console.log("Actor:", actorId);

  const actorPath = actorId.replace("/", "~");

  const inputs = [
    {
      name: "camelCase",
      input: {
        nameSearchKeywords: "Recruitment agency owners Founder CEO Owner",
        jobTitle: "Recruitment agency owners Founder CEO Owner",
        geocodeLocation: "United States",
        maximumResults: 10
      }
    },
    {
      name: "snake_case",
      input: {
        name_search_keywords: "Recruitment agency owners Founder CEO Owner",
        job_title: "Recruitment agency owners Founder CEO Owner",
        geocode_location: "United States",
        maximum_results: 10
      }
    }
  ];

  for (const test of inputs) {
    console.log("\nTesting:", test.name);
    console.log("Input:", JSON.stringify(test.input, null, 2));

    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test.input)
      }
    );

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text.slice(0, 500));

    if (res.ok) {
      console.log("✅ WORKING INPUT FOUND:", test.name);
      return;
    }
  }

  console.log("❌ No input worked.");
}

main().catch(console.error);
