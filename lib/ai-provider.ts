import { isByokEnabled, resolveUserApiKey } from '@/lib/byok';

export async function generateAiResponse(prompt: string, userId?: string): Promise<any> {
  const providerRaw = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  let provider = 'bayofassets';
  if (providerRaw === 'google') provider = 'google';
  // Default to OpenRouter when explicitly set, when BYOK (users bring OpenRouter keys),
  // or when a server OpenRouter key is present.
  if (
    providerRaw === 'openrouter' ||
    (!providerRaw && (isByokEnabled() || !!process.env.OPENROUTER_API_KEY))
  ) {
    provider = 'openrouter';
  }

  if (provider === 'openrouter') {
    if (!userId && isByokEnabled()) {
      throw new Error('Add your OpenRouter API key in Settings.');
    }
    const apiKey = userId
      ? await resolveUserApiKey(userId, 'openrouter')
      : (process.env.OPENROUTER_API_KEY || '');
    if (!apiKey) {
      throw new Error(
        isByokEnabled()
          ? 'Add your OpenRouter API key in Settings.'
          : 'OPENROUTER_API_KEY is not configured.'
      );
    }

    const model = process.env.OPENROUTER_MODEL || process.env.OPENROUTER_EMAIL_MODEL || 'openai/gpt-4o-mini';

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://funnelzen.ai',
        'X-Title': 'FunnelZen AI',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`OpenRouter AI provider failed: ${data.error?.message || JSON.stringify(data)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty response. Please try again.');
    }

    return content;
  }

  if (provider === 'google') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('Google AI API key is not configured or invalid.');
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.7,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || '';
      if (res.status === 400 && errMsg.toLowerCase().includes('api key')) throw new Error('Google AI API key is not configured or invalid.');
      if (res.status === 403) throw new Error('Google AI API key is not configured or invalid.');
      if (res.status === 429 || errMsg.toLowerCase().includes('quota')) throw new Error('Google AI quota limit reached. Please try again later.');
      console.error(`Google AI API Error: ${errMsg || JSON.stringify(data)}`);
      throw new Error('AI generation failed. Please try again.');
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('AI could not generate this email because the prompt was blocked by safety filters. Please simplify the campaign offer and try again.');
    }

    const content = candidate?.content?.parts?.[0]?.text;
    console.log("AI response content length:", content?.length || 0);

    if (!content) {
      throw new Error('Google Gemini returned an empty response. Please try again.');
    }

    return content;
  } else if (provider === 'bayofassets') {
    if (!userId && isByokEnabled()) {
      throw new Error('Add your Bay of Assets API key in Settings.');
    }
    const apiKey = userId
      ? await resolveUserApiKey(userId, 'bayofassets')
      : (process.env.BAYOFASSETS_API_KEY || '');
    if (!apiKey) {
      throw new Error(
        isByokEnabled()
          ? 'Add your Bay of Assets API key in Settings.'
          : 'Bay of Assets API key is not configured.'
      );
    }

    const baseUrl = process.env.BAYOFASSETS_BASE_URL;
    if (!baseUrl) {
      throw new Error('Bay of Assets base URL is not configured.');
    }

    const model = process.env.BAYOFASSETS_MODEL;
    if (!model) {
      throw new Error('Bay of Assets model is not configured.');
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2048,
        stream: false
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Bay of Assets AI provider failed: ${data.error?.message || JSON.stringify(data)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    console.log("AI response content length:", content?.length || 0);

    if (!content) {
      throw new Error('Bay of Assets returned an empty response. Please try again.');
    }

    return content;
  } else {
    // Default fallback to Bay of Assets
    if (!userId && isByokEnabled()) {
      throw new Error('Add your Bay of Assets API key in Settings.');
    }
    const apiKey = userId
      ? await resolveUserApiKey(userId, 'bayofassets')
      : (process.env.BAYOFASSETS_API_KEY || '');
    if (!apiKey) {
      throw new Error(
        isByokEnabled()
          ? 'Add your Bay of Assets API key in Settings.'
          : 'Bay of Assets API key is not configured.'
      );
    }

    const baseUrl = process.env.BAYOFASSETS_BASE_URL || 'https://api.bayofassets.com';
    const model = process.env.BAYOFASSETS_MODEL || 'default-model';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2048,
        stream: false
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(`Bay of Assets AI provider failed: ${data.error?.message || JSON.stringify(data)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    console.log("AI response content length:", content?.length || 0);

    if (!content) {
      throw new Error('Bay of Assets returned an empty response. Please try again.');
    }

    return content;
  }
}
