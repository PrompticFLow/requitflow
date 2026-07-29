import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { processDueEmails } from '@/lib/email-dispatch';

export const maxDuration = 300;

// Manual "process now" trigger for a campaign. The same pipeline runs
// unattended via /api/cron/send-due-emails — this endpoint just lets the UI
// nudge it immediately instead of waiting for the next cron tick.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const campaignId = (await params).id;

  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.status !== 'Active') {
      return NextResponse.json({ error: 'Campaign must be Active to send emails.' }, { status: 400 });
    }

    const result = await processDueEmails({ userId: user.id });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Process due emails error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
