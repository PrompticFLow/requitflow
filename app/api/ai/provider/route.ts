import { NextResponse } from 'next/server';
import { isByokEnabled } from '@/lib/byok';

export async function GET() {
  const providerRaw = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const isByok = isByokEnabled();
  
  let provider = 'Google Gemini';
  let model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  let configured = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (providerRaw === 'bayofassets') {
    provider = 'Bay of Assets';
    model = process.env.BAYOFASSETS_MODEL || 'configured model id';
    // When BYOK, keys live in user Settings; env presence is informational only.
    configured = isByok || !!process.env.BAYOFASSETS_API_KEY;
  } else if (providerRaw === 'openrouter' || (!providerRaw && (isByok || !!process.env.OPENROUTER_API_KEY))) {
    provider = 'OpenRouter';
    model = process.env.OPENROUTER_MODEL || process.env.OPENROUTER_EMAIL_MODEL || 'openai/gpt-4o-mini';
    configured = isByok || !!process.env.OPENROUTER_API_KEY;
  }
  
  return NextResponse.json({ provider, model, configured, isByok });
}
