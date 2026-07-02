import { NextResponse } from "next/server";
import { generateAiResponse } from "@/lib/ai-provider";

export async function GET() {
  try {
    const response = await generateAiResponse("Reply with exactly: Gemini connected");
    return NextResponse.json({
      success: true,
      message: response,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Gemini test failed.",
      technicalError: error.message,
    });
  }
}
