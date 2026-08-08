import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { fillDraftsForDisplay } from '@/lib/email/fill-drafts';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sequences = await prisma.emailSequence.findMany({
    where: { userId: user.id },
    include: {
      lead: { select: { businessName: true } },
      campaign: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ sequences: await fillDraftsForDisplay(prisma, sequences) });
}
