import { NextResponse } from 'next/server';
import { processDueEmails } from '@/lib/email-dispatch';

export const maxDuration = 300; // Vercel timeout max

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processDueEmails();

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Process due emails error:', error);
    return NextResponse.json({ error: 'Failed to process emails' }, { status: 500 });
  }
}
