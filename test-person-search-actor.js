// require("dotenv").config({ path: ".env.local" });

async function main() {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.PERSON_BULK_SEARCH_ACTOR_ID;

  console.log("Has token:", Boolean(token));
  console.log("Actor:", actorId);

  if (!token) throw new Error("APIFY_API_TOKEN missing");
  if (!actorId) throw new Error("PERSON_BULK_SEARCH_ACTOR_ID missing");

  const actorPath = actorId.replace("/", "~");

  const inputs = [
    {
      name: "search/location/maxItems",
      input: {
        search: "Recruitment agency owners Founder CEO Owner",
        location: "United States",
        maxItems: 10
      }
    },
    {
      name: "query/maxItems",
      input: {
        query: "Recruitment agency owners Founder CEO Owner United States",
        maxItems: 10
      }
    },
    {
      name: "keywords/location/limit",
      input: {
        keywords: "Recruitment agency owners Founder CEO Owner",
        location: "United States",
        limit: 10
      }
    },
    {
      name: "searchQuery/limit",
      input: {
        searchQuery: "Recruitment agency owners Founder CEO Owner United States",
        limit: 10
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
    console.log("Response:", text.slice(0, 1500));

    if (res.ok) {
      console.log("✅ WORKING INPUT FOUND:", test.name);
      return;
    }
  }

  console.log("❌ No input worked. Need exact actor input schema.");
}

main().catch(console.error);
