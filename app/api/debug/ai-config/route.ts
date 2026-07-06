import { NextResponse } from "next/server";

export async function GET() {
  const geminiApiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY;

  return NextResponse.json({
    success: true,
    aiProvider: process.env.AI_PROVIDER || null,
    geminiModel: process.env.GEMINI_MODEL || null,
    geminiApiKeyPresent: !!geminiApiKey,
    geminiApiKeyLength: geminiApiKey?.length || 0,
    bayOfAssetsKeyPresent: !!process.env.BAYOFASSETS_API_KEY,
  });
}
