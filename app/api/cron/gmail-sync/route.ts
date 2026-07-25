import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pollGmailAccount } from '@/lib/gmail';
import { processDueEmails } from '@/lib/email-dispatch';

export const maxDuration = 300;

// Cron: polls every connected Gmail inbox for replies + bounces,
// then processes any due scheduled emails.
export async function GET() {
  try {
    const accounts = await prisma.gmailAccount.findMany({
      where: { status: 'Active' },
      select: { id: true, email: true },
    });

    const results: any[] = [];
    for (const account of accounts) {
      try {
        const result = await pollGmailAccount(account.id);
        results.push({ email: account.email, ...result });
      } catch (err: any) {
        console.error('Gmail poll failed for', account.email, err?.message);
        await prisma.gmailAccount.update({
          where: { id: account.id },
          data: { lastError: err?.message?.slice(0, 500) || 'Poll failed' },
        }).catch(() => {});
        results.push({ email: account.email, error: err?.message });
      }
    }

    // Send any scheduled emails that are due
    const dispatch = await processDueEmails({ limit: 25 });

    return NextResponse.json({ success: true, polled: results, dispatch });
  } catch (error: any) {
    console.error('Gmail sync cron error:', error);
    return NextResponse.json({ error: error?.message || 'Sync failed' }, { status: 500 });
  }
}
