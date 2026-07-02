import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => c.name);
  const user = await getCurrentUser();

  return NextResponse.json({
    success: true,
    cookieNames: allCookies,
    authenticated: !!user,
    userId: user?.id || null,
    email: user?.email || null,
  });
}
