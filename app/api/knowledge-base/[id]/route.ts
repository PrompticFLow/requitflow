import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const file = await prisma.knowledgeBaseFile.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        summary: true,
        status: true,
        createdAt: true,
        campaignId: true,
        userId: true
        // Do not expose full extractedText here for safety
      }
    });

    if (!file || file.userId !== user.id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, file });
  } catch (error: any) {
    console.error('Fetch Knowledge Base file error:', error);
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    // Verify ownership
    const file = await prisma.knowledgeBaseFile.findUnique({
      where: { id }
    });

    if (!file || file.userId !== user.id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await prisma.knowledgeBaseFile.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'File deleted successfully' });
  } catch (error: any) {
    console.error('Delete Knowledge Base file error:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
