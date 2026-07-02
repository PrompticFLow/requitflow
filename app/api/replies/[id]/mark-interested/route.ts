import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    
    const reply = await prisma.emailReply.findUnique({
      where: { id }
    });

    if (!reply || reply.userId !== user.id) {
      return NextResponse.json({ error: 'Reply not found' }, { status: 404 });
    }

    await prisma.emailReply.update({
      where: { id },
      data: {
        classification: 'Interested',
        status: 'Handled'
      }
    });

    if (reply.leadId) {
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: { status: 'Interested' }
      });
    }

    return NextResponse.json({ success: true, message: 'Marked as interested.' });
  } catch (error: any) {
    console.error('Mark interested error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
