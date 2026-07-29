import { NextResponse } from 'next/server';
import { processDueEmails } from '@/lib/email-dispatch';

export const maxDuration = 300;

// Cron: processes any due scheduled campaign emails (Email 1 + follow-ups +
// queued AI reply continuations). Reply capture arrives via /api/webhooks/resend.
export async function GET() {
  try {
    const dispatch = await processDueEmails({ limit: 25 });
    return NextResponse.json({ success: true, dispatch });
  } catch (error: any) {
    console.error('Send-due-emails cron error:', error);
    return NextResponse.json({ error: error?.message || 'Dispatch failed' }, { status: 500 });
  }
}
