// require("dotenv").config({ path: ".env.local" });

async function main() {
  const actorId = process.env.PERSON_BULK_SEARCH_ACTOR_ID;
  if (!actorId) throw new Error("PERSON_BULK_SEARCH_ACTOR_ID missing");
  const actorPath = actorId.replace("/", "~");

  const res = await fetch(`https://api.apify.com/v2/acts/${actorPath}`);
  const data = await res.json();

  console.log("Actor name:", data?.data?.name);
  console.log("Example input:");
  console.log(JSON.stringify(data?.data?.exampleRunInput, null, 2));
  console.log("Input schema:");
  console.log(JSON.stringify(data?.data?.inputSchema, null, 2)?.slice(0, 5000));
}

main().catch(console.error);
