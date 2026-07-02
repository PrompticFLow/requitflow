import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return NextResponse.json({
      success: true,
      database: "connected",
      userCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        database: "failed",
        error: "Database connection failed.",
        technicalError: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
