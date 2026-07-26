// Runs once when the Next.js server boots (Railway / VPS / Docker / `next start`).
// Starts a background scheduler that sends due campaign emails and polls Gmail
// inboxes for replies + bounces — no cron service or user visit required.
//
// Env knobs:
//   SCHEDULER_INTERVAL_MINUTES   how often to tick (default 10)
//   DISABLE_BACKGROUND_SCHEDULER set to "true" to turn off (e.g. on Vercel,
//                                where /api/cron/gmail-sync does the same job)

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.DISABLE_BACKGROUND_SCHEDULER === 'true') return;

  const g = globalThis as any;
  if (g.__funnelzenSchedulerStarted) return;
  g.__funnelzenSchedulerStarted = true;

  const intervalMinutes = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MINUTES || '10') || 10);
  console.log(`[scheduler] Background email scheduler active — every ${intervalMinutes} min`);

  let running = false;

  const tick = async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      const { prisma } = await import('@/lib/prisma');
      const { processDueEmails } = await import('@/lib/email-dispatch');
      const { pollGmailAccount } = await import('@/lib/gmail');

      // 1. Poll every connected Gmail inbox for replies and bounces
      const accounts = await prisma.gmailAccount.findMany({
        where: { status: 'Active' },
        select: { id: true, email: true },
      });
      for (const account of accounts) {
        try {
          const result = await pollGmailAccount(account.id);
          if (result.repliesFound > 0 || result.bouncesFound > 0) {
            console.log(`[scheduler] ${account.email}: ${result.repliesFound} replies, ${result.bouncesFound} bounces`);
          }
        } catch (err: any) {
          console.error(`[scheduler] Gmail poll failed for ${account.email}:`, err?.message);
        }
      }

      // 2. Send any due scheduled emails (Email 1 + follow-ups)
      const dispatch = await processDueEmails({});
      if (dispatch.sent > 0 || dispatch.failed > 0) {
        console.log(`[scheduler] Dispatch: ${dispatch.sent} sent, ${dispatch.failed} failed`);
      }
    } catch (err: any) {
      console.error('[scheduler] Tick failed:', err?.message);
    } finally {
      running = false;
    }
  };

  // First tick shortly after boot (faster in dev so reply testing isn't blocked),
  // then on the configured interval.
  const firstDelayMs = process.env.NODE_ENV === 'development' ? 5_000 : 30_000;
  setTimeout(tick, firstDelayMs);
  setInterval(tick, intervalMinutes * 60_000);
}
