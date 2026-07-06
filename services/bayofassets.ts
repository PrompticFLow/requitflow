export async function generateText(apiKey: string, prompt: string, model?: string) {
  const url = (process.env.BAYOFASSETS_BASE_URL || 'https://api.bayofassets.com') + '/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || process.env.BAYOFASSETS_MODEL || 'default',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Bay of Assets generation failed: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateLeadInsight(apiKey: string, lead: any) {
  const prompt = `You are an expert sales assistant for a recruitment agency. Look at this local business lead from Google Maps:
Name: ${lead.businessName}
Category: ${lead.category || 'Unknown'}
Rating: ${lead.rating || 'None'}
Address: ${lead.address || 'Unknown'}

Write one short, personalized, professional sentence (under 20 words) explaining why they might be a good fit for recruitment support, candidate communication automation, or staffing services. Don't use quotes.`;

  return generateText(apiKey, prompt);
}
