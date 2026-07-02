import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const files = await prisma.knowledgeBaseFile.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        summary: true,
        status: true,
        createdAt: true,
        campaignId: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, files });
  } catch (error: any) {
    console.error('Fetch Knowledge Base files error:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}
