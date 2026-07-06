import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.campaign.deleteMany({
      where: { userId: user.id }
    });

    return NextResponse.json({ success: true, message: 'All campaigns deleted successfully' });
  } catch (error) {
    console.error('Delete all campaigns error:', error);
    return NextResponse.json({ error: 'Failed to delete all campaigns' }, { status: 500 });
  }
}
