import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    if (!id || typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ success: false, error: "Email draft ID is missing." }, { status: 400 });
    }

    const existing = await prisma.emailSequence.findFirst({ where: { id, userId: user.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Email draft not found.' }, { status: 404 });
    }

    const updated = await prisma.emailSequence.update({
      where: { id: (await params).id },
      data: {
        approvalStatus: "Rejected",
        approvedAt: null
      }
    });

    return NextResponse.json({ success: true, email: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
