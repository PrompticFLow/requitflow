import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleInboundReply } from '@/lib/reply-handler';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const isDev = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const isAdmin = user?.role === 'ADMIN';

  if (!isDev && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId, leadId, body, fromEmail, subject } = await req.json();

    if (!leadId || !body) {
      return NextResponse.json({ error: 'leadId and body are required' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const email = fromEmail || lead.email || 'lead-simulation@example.com';
    const testSubject = subject || 'Re: Quick question';

    const result = await handleInboundReply({
      fromEmail: email,
      subject: testSubject,
      body,
      campaignId: campaignId || lead.campaignId || undefined,
      leadId: lead.id
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Simulate reply error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
