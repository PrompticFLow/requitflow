import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const bookedCalls = await prisma.bookedCall.findMany({
      where: { userId: user.id },
      include: {
        lead: true,
        campaign: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ success: true, calls: bookedCalls });
  } catch (error: any) {
    console.error('Fetch booked calls error:', error);
    return NextResponse.json({ error: 'Fetch failed.' }, { status: 500 });
  }
}
