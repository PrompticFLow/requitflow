const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.PERSON_VALID_LEADS_ACTOR_ID;
  
  if (!token || !actorId) {
    console.log("Missing token or actor id");
    return;
  }
  
  const input = {
    queries: ['Founder recruitment agency United States email phone'],
    extractEmails: true,
    extractPhones: true,
    maxResultsPerQuery: 25
  };
  
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    console.log('Status:', res.status);
    console.log('Response:', await res.text());
  } catch(e) {
    console.log(e);
  }
}
run();
