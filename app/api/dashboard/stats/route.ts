import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { Prisma } from '@prisma/client';

type HistoryItem = {
  type: 'email' | 'reply' | 'meeting' | 'created';
  label: string;
  at: string;
};

const STATUS_GROUPS: Record<string, string[]> = {
  new: ['New'],
  contacted: ['Added to Campaign', 'Email Generated', 'Contacted'],
  replied: ['Replied', 'Interested', 'Not Interested'],
  booked: ['Booked', 'Call Booked'],
};

function contactName(lead: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  if (lead.fullName?.trim()) return lead.fullName.trim();
  const parts = [lead.firstName, lead.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

function lastActivityFromLead(lead: {
  createdAt: Date;
  emailSequences: Array<{ sequenceStep: number; sentAt: Date | null }>;
  emailReplies: Array<{ intent: string | null; classification: string | null; createdAt: Date }>;
  bookedCalls: Array<{ callDate: Date | null; createdAt: Date; status: string }>;
}): { label: string; at: string | null } {
  const candidates: HistoryItem[] = [];

  for (const call of lead.bookedCalls) {
    candidates.push({
      type: 'meeting',
      label:
        call.status === 'Canceled' || call.status === 'Cancelled'
          ? 'Meeting canceled'
          : 'Call booked',
      at: (call.callDate || call.createdAt).toISOString(),
    });
  }
  for (const reply of lead.emailReplies) {
    const intent = reply.intent || reply.classification;
    candidates.push({
      type: 'reply',
      label: intent ? `Replied — ${intent}` : 'Reply received',
      at: reply.createdAt.toISOString(),
    });
  }
  for (const seq of lead.emailSequences) {
    if (!seq.sentAt) continue;
    candidates.push({
      type: 'email',
      label: `Email ${seq.sequenceStep} sent`,
      at: seq.sentAt.toISOString(),
    });
  }
  candidates.push({
    type: 'created',
    label: 'Company found',
    at: lead.createdAt.toISOString(),
  });

  candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { label: candidates[0].label, at: candidates[0].at };
}

function emptyTrend() {
  const trend: Array<{ date: string; emailsSent: number; replies: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    trend.push({ date: d.toISOString().split('T')[0], emailsSent: 0, replies: 0 });
  }
  return trend;
}

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = user.id;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '20', 10) || 20));
    const statusGroup = url.searchParams.get('status') || 'all';
    const q = (url.searchParams.get('q') || '').trim();

    const leadWhere: Prisma.LeadWhereInput = {
      userId,
      source: { not: 'Candidate' },
    };

    if (statusGroup !== 'all' && STATUS_GROUPS[statusGroup]) {
      leadWhere.status = { in: STATUS_GROUPS[statusGroup] };
    }

    if (q) {
      leadWhere.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const baseLeadWhere = { userId, source: { not: 'Candidate' } };
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      companiesFound,
      emailsSent,
      repliesReceived,
      meetingsBooked,
      activeCampaigns,
      filteredTotal,
      leads,
      recentEmails,
      recentReplies,
    ] = await Promise.all([
      prisma.lead.count({ where: baseLeadWhere }),
      prisma.emailSequence.count({ where: { userId, status: 'Sent' } }),
      prisma.emailReply.count({ where: { userId } }),
      prisma.bookedCall.count({ where: { userId } }),
      prisma.campaign.count({ where: { userId, status: 'Active' } }),
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.findMany({
        where: leadWhere,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          businessName: true,
          fullName: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          leadTier: true,
          campaignId: true,
          createdAt: true,
          updatedAt: true,
          campaign: { select: { id: true, name: true } },
          emailSequences: {
            where: { status: 'Sent' },
            orderBy: { sentAt: 'desc' },
            take: 1,
            select: { sequenceStep: true, sentAt: true },
          },
          emailReplies: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { intent: true, classification: true, createdAt: true },
          },
          bookedCalls: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { callDate: true, status: true, createdAt: true },
          },
        },
      }),
      prisma.emailSequence.findMany({
        where: { userId, status: 'Sent', sentAt: { gte: sevenDaysAgo } },
        select: { sentAt: true },
      }),
      prisma.emailReply.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    const trend = emptyTrend();
    const trendMap = Object.fromEntries(trend.map((t) => [t.date, t]));

    for (const e of recentEmails) {
      if (!e.sentAt) continue;
      const key = e.sentAt.toISOString().split('T')[0];
      if (trendMap[key]) trendMap[key].emailsSent += 1;
    }
    for (const r of recentReplies) {
      const key = r.createdAt.toISOString().split('T')[0];
      if (trendMap[key]) trendMap[key].replies += 1;
    }

    const companies = leads.map((lead) => ({
      id: lead.id,
      businessName: lead.businessName,
      contactName: contactName(lead),
      email: lead.email,
      status: lead.status,
      leadTier: lead.leadTier,
      campaignId: lead.campaignId,
      campaignName: lead.campaign?.name || null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      lastActivity: lastActivityFromLead(lead),
      history: [] as HistoryItem[],
    }));

    const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

    return NextResponse.json({
      companiesFound,
      emailsSent,
      repliesReceived,
      meetingsBooked,
      activeCampaigns,
      discoveryCallsBooked: meetingsBooked,
      funnel: {
        companies: companiesFound,
        emailsSent,
        replies: repliesReceived,
        meetings: meetingsBooked,
      },
      trend,
      companies,
      pagination: {
        page,
        pageSize,
        total: filteredTotal,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard stats', details: error.message },
      { status: 500 }
    );
  }
}
