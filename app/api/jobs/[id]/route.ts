import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params; // Next.js 15 requires awaiting params
    
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        company: true,
        aiJobAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        savedJobs: {
          where: { userId: user.id }
        },
        jobApplications: {
          where: { userId: user.id }
        }
      }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });

  } catch (error: any) {
    console.error('Fetch Job Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
