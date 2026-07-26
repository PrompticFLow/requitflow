import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const bookedCall = await prisma.bookedCall.findUnique({
      where: { id },
    });

    if (!bookedCall || bookedCall.userId !== user.id) {
      return NextResponse.json({ error: 'Booked call not found' }, { status: 404 });
    }

    if (bookedCall.status === 'Closed') {
      return NextResponse.json({ success: true, call: bookedCall, message: 'Already closed.' });
    }

    const updated = await prisma.bookedCall.update({
      where: { id },
      data: { status: 'Closed' },
    });

    return NextResponse.json({ success: true, call: updated, message: 'Marked as closed.' });
  } catch (error: any) {
    console.error('Mark booked call closed error:', error);
    return NextResponse.json({ error: 'Failed to mark as closed.' }, { status: 500 });
  }
}
