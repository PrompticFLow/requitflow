import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawLeads = await prisma.rawLead.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ leads: rawLeads });
  } catch (err: any) {
    console.error("Raw Leads API error:", err);
    return NextResponse.json({ error: "Failed to load raw leads" }, { status: 500 });
  }
}
