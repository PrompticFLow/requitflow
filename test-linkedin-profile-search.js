// require("dotenv").config({ path: ".env.local" });

async function main() {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.PERSON_BULK_SEARCH_ACTOR_ID;

  if (!token) throw new Error("APIFY_API_TOKEN missing");
  if (!actorId) throw new Error("PERSON_BULK_SEARCH_ACTOR_ID missing");

  const actorPath = actorId.replace("/", "~");

  const testInputs = [
    {
      name: "Option A search/location/maxItems",
      input: {
        search: "Recruitment agency owners Founder CEO Owner",
        location: "United States",
        maxItems: 10
      }
    },
    {
      name: "Option B query/maxItems",
      input: {
        query: "Recruitment agency owners Founder CEO Owner United States",
        maxItems: 10
      }
    },
    {
      name: "Option C keywords/location/limit",
      input: {
        keywords: "Recruitment agency owners Founder CEO Owner",
        location: "United States",
        limit: 10
      }
    },
    {
      name: "Option D searchQuery/limit",
      input: {
        searchQuery: "Recruitment agency owners Founder CEO Owner United States",
        limit: 10
      }
    },
    {
      name: "Option E keywords/maxItems",
      input: {
        keywords: "Recruitment agency owners Founder CEO Owner United States",
        maxItems: 10
      }
    },
    {
      name: "Option F queries/maxItems",
      input: {
        queries: "Recruitment agency owners Founder CEO Owner United States",
        maxItems: 10
      }
    }
  ];

  for (const test of testInputs) {
    console.log("\nTesting:", test.name);
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
    console.log("Response:", text.slice(0, 1000));

    if (res.ok) {
      console.log("WORKING INPUT:", JSON.stringify(test.input, null, 2));
      return;
    }
  }

  console.log("No tested input schema worked. Need actor input schema from Apify.");
}

main().catch(console.error);
