import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');     // Pending|Approved|Rejected|Edited|Failed
    const campaignId = searchParams.get('campaignId');
    const step = searchParams.get('step');
    const search = searchParams.get('search');
    const spamRisk = searchParams.get('spamRisk');       // High

    const where: any = { userId: user.id, deletedAt: null };

    if (campaignId && campaignId !== 'All') {
      where.campaignId = campaignId;
    }
    if (step && step !== 'All') {
      where.sequenceStep = parseInt(step);
    }
    if (statusFilter && statusFilter !== 'All') {
      if (statusFilter === 'Edited') {
        where.OR = [
          { editedSubject: { not: null } },
          { editedBody: { not: null } }
        ];
      } else if (statusFilter === 'High Spam Risk') {
        where.spamRisk = 'High';
      } else if (statusFilter === 'Failed Generation') {
        where.status = 'Failed';
      } else {
        where.approvalStatus = statusFilter;
      }
    }
    if (spamRisk === 'High') {
      where.spamRisk = 'High';
    }

    const emails = await prisma.emailSequence.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true } },
        lead: { select: { id: true, businessName: true, email: true, category: true, location: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    // Apply text search
    let filtered = emails;
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = emails.filter(e =>
        e.campaign?.name?.toLowerCase().includes(term) ||
        e.lead?.businessName?.toLowerCase().includes(term) ||
        e.lead?.email?.toLowerCase().includes(term) ||
        e.subject?.toLowerCase().includes(term) ||
        e.body?.toLowerCase().includes(term)
      );
    }

    return NextResponse.json({ pendingEmails: filtered });
  } catch (error: any) {
    console.error('Fetch email sequences error:', error);
    return NextResponse.json({
      error: 'Something went wrong while loading email drafts. Please try again.'
    }, { status: 500 });
  }
}
