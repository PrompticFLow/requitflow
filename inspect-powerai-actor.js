async function main() {
  const actorId =
    process.env.PERSON_BULK_SEARCH_ACTOR_ID ||
    process.env.PERSON_VALID_LEADS_ACTOR_ID;

  if (!actorId) throw new Error("Missing person actor env");

  const actorPath = actorId.replace("/", "~");

  const res = await fetch(`https://api.apify.com/v2/acts/${actorPath}`);
  const data = await res.json();

  console.log("Actor:", actorId);
  console.log("Example input:");
  console.log(JSON.stringify(data?.data?.exampleRunInput, null, 2));
  console.log("Input schema:");
  console.log(JSON.stringify(data?.data?.inputSchema, null, 2));
}

main().catch(console.error);
