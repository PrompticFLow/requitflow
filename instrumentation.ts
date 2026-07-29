// Runs once when the Next.js server boots on the Railway dedicated server
// (or any VPS / Docker / `next start`). This IS the app's scheduler — it sends
// due campaign emails on an interval; no external cron service is needed.
// Replies arrive push-based via /api/webhooks/resend.
//
// Env knobs:
//   SCHEDULER_INTERVAL_MINUTES   how often to tick (default 10)
//   DISABLE_BACKGROUND_SCHEDULER set to "true" to turn off (only if you drive
//                                /api/cron/send-due-emails from an external cron)

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
      const { processDueEmails } = await import('@/lib/email-dispatch');

      // Send any due scheduled emails (Email 1 + follow-ups + AI replies).
      // Reply capture is push-based via the Resend webhook (/api/webhooks/resend).
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
