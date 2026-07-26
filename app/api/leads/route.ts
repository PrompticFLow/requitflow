import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

const LEAD_LIST_SELECT = {
  id: true,
  businessName: true,
  fullName: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  email: true,
  phone: true,
  website: true,
  leadScore: true,
  leadTier: true,
  status: true,
  category: true,
  country: true,
  emailStatus: true,
  emailVerifiedAt: true,
  hiringStatus: true,
  hiringSignal: true,
  hiringSourceUrl: true,
  hiringJobCount: true,
  hiringCheckedAt: true,
  campaignId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaignId');
  const source = url.searchParams.get('source');
  const q = (url.searchParams.get('q') || '').trim();
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');
  const hiringStatus = url.searchParams.get('hiringStatus');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25)
  );

  const whereClause: Prisma.LeadWhereInput = { userId: user.id };
  if (campaignId) whereClause.campaignId = campaignId;
  if (source) whereClause.source = source;
  if (tier && tier !== 'All') whereClause.leadTier = tier;
  if (status && status !== 'All') whereClause.status = status;

  if (hiringStatus && hiringStatus !== 'All') {
    if (hiringStatus === 'Not Checked') {
      whereClause.hiringCheckedAt = null;
    } else {
      whereClause.hiringCheckedAt = { not: null };
      whereClause.hiringStatus = hiringStatus;
    }
  }

  if (q) {
    whereClause.OR = [
      { businessName: { contains: q, mode: 'insensitive' } },
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { website: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
      { country: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where: whereClause }),
      prisma.lead.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LEAD_LIST_SELECT,
      }),
    ]);

    return NextResponse.json({
      leads,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err: any) {
    console.error('Leads API error:', err);
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();

    const lead = await prisma.lead.create({
      data: {
        ...data,
        userId: user.id,
      },
    });

    return NextResponse.json({ lead });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
