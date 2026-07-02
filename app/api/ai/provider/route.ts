import { NextResponse } from 'next/server';

export async function GET() {
  const providerRaw = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  
  let provider = 'Google Gemini';
  let model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  let configured = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (providerRaw === 'bayofassets') {
    provider = 'Bay of Assets';
    model = process.env.BAYOFASSETS_MODEL || 'configured model id';
    configured = !!process.env.BAYOFASSETS_API_KEY;
  } else if (providerRaw === 'openrouter') {
    provider = 'OpenRouter';
    model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
    configured = !!process.env.OPENROUTER_API_KEY;
  }
  
  return NextResponse.json({ provider, model, configured });
}
