import { prisma } from '@/lib/prisma';

// Public one-click unsubscribe endpoint linked from every campaign email.
// Adds the lead to the user's unsubscribe list and cancels queued emails.
export async function GET(req: Request, { params }: { params: Promise<{ sendLogId: string }> }) {
  const { sendLogId } = await params;

  const page = (message: string) => new Response(
    `<!DOCTYPE html><html><head><title>Unsubscribe</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
<div style="text-align:center; padding:40px; max-width:420px;">
<h2 style="margin-bottom:12px;">${message}</h2>
<p style="color:#94a3b8; font-size:14px;">You will not receive any further emails from this sender.</p>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );

  try {
    const sendLog = await prisma.emailSendLog.findUnique({
      where: { id: sendLogId },
      include: { lead: true, campaign: true },
    });

    if (!sendLog || !sendLog.lead?.email) {
      return page('This unsubscribe link is invalid or has expired.');
    }

    const { lead, campaign } = sendLog;

    await prisma.unsubscribeList.upsert({
      where: { userId_email: { userId: campaign.userId, email: lead.email! } },
      update: { reason: 'Clicked unsubscribe link' },
      create: { userId: campaign.userId, email: lead.email!, reason: 'Clicked unsubscribe link' },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: 'Unsubscribed' },
    });

    await prisma.emailSequence.updateMany({
      where: { leadId: lead.id, status: { in: ['Queued', 'Draft'] } },
      data: { status: 'Cancelled', errorMessage: 'Lead unsubscribed' },
    });

    return page('You have been unsubscribed.');
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return page('Something went wrong. Please try again.');
  }
}

// Support List-Unsubscribe-Post one-click (RFC 8058)
export async function POST(req: Request, ctx: { params: Promise<{ sendLogId: string }> }) {
  return GET(req, ctx);
}
