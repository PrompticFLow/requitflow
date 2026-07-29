import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { getReceivedEmail } from '@/lib/resend';
import { handleInboundReply } from '@/lib/reply-handler';

export const maxDuration = 60;

// Resend webhook receiver — reply capture with zero per-customer setup.
//
// When a campaign's Resend API key is saved, the app automatically creates a
// webhook in that customer's Resend account pointing here (see the campaign
// PATCH route). The customer only needs their domain's DNS records from the
// Resend Domains page (SPF/DKIM to send + the receiving MX record) — no IMAP,
// no app passwords.
//
// email.received payloads carry metadata only; the full body is fetched from
// GET /emails/receiving/{id} using the matching campaign's own API key.

function verifySvixSignature(payload: string, headers: Headers, secret: string): boolean {
  try {
    const id = headers.get('svix-id');
    const timestamp = headers.get('svix-timestamp');
    const signatureHeader = headers.get('svix-signature');
    if (!id || !timestamp || !signatureHeader) return false;

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signedContent = `${id}.${timestamp}.${payload}`;
    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

    // Header may contain multiple space-separated signatures like "v1,<sig>"
    return signatureHeader.split(' ').some(part => {
      const sig = part.split(',')[1] || part;
      try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function isSignatureValid(rawBody: string, headers: Headers): Promise<boolean> {
  // Global secret (single-webhook setups)
  const globalSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (globalSecret && verifySvixSignature(rawBody, headers, globalSecret)) return true;

  // Per-campaign secrets (auto-created webhooks in each customer's account)
  const campaigns = await prisma.campaign.findMany({
    where: { resendWebhookSecretEncrypted: { not: null } },
    select: { resendWebhookSecretEncrypted: true }
  });
  const secrets = new Set<string>();
  for (const c of campaigns) {
    try {
      const s = decrypt(c.resendWebhookSecretEncrypted!);
      if (s) secrets.add(s);
    } catch { /* ignore undecryptable secrets */ }
  }
  for (const s of Array.from(secrets)) {
    if (verifySvixSignature(rawBody, headers, s)) return true;
  }

  // No known secrets at all → accept unverified (nothing to verify against)
  return !globalSecret && secrets.size === 0;
}

function extractAddress(value: any): string {
  if (!value) return '';
  if (Array.isArray(value)) return extractAddress(value[0]);
  if (typeof value === 'object') return value.email || value.address || '';
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : String(value)).trim();
}

function extractAllAddresses(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(v => extractAddress(v)).filter(Boolean);
  return [extractAddress(value)].filter(Boolean);
}

function headerValue(headers: any, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    const hit = headers.find((h: any) => String(h?.name || '').toLowerCase() === lower);
    return hit?.value || '';
  }
  if (typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lower) return String(headers[key] ?? '');
    }
  }
  return '';
}

/** Finds the campaign whose sender address matches one of the inbound recipients. */
async function findCampaignForRecipients(toAddresses: string[]) {
  if (toAddresses.length === 0) return null;
  return prisma.campaign.findFirst({
    where: {
      resendApiKeyEncrypted: { not: null },
      resendFromEmail: { in: toAddresses.map(a => a.toLowerCase()) }
    },
    orderBy: { updatedAt: 'desc' }
  });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    if (!(await isSignatureValid(rawBody, req.headers))) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const type = event?.type || event?.event || '';
    const data = event?.data || {};

    // ── Bounces / spam complaints: mark the lead and stop their queued emails ──
    if (type === 'email.bounced' || type === 'email.complained') {
      const bouncedTo = extractAddress(data.to);
      if (bouncedTo) {
        const status = type === 'email.bounced' ? 'Bounced' : 'Spam complaint';
        const leads = await prisma.lead.findMany({
          where: { email: { equals: bouncedTo, mode: 'insensitive' } },
          select: { id: true }
        });
        for (const lead of leads) {
          await prisma.lead.update({ where: { id: lead.id }, data: { status } });
          await prisma.emailSequence.updateMany({
            where: { leadId: lead.id, sentAt: null, status: { in: ['Draft', 'Queued', 'Scheduled'] } },
            data: { status: 'Cancelled', errorMessage: `Email ${status.toLowerCase()}` }
          });
        }
        return NextResponse.json({ success: true, handled: type, leadsUpdated: leads.length });
      }
      return NextResponse.json({ success: true, handled: type, leadsUpdated: 0 });
    }

    // ── Inbound replies ────────────────────────────────────────────────────
    if (type === 'email.received' || type === 'inbound.email.received' || (!type && (data.from || event.from))) {
      let d = data.from || data.text || data.html ? data : event;

      const toAddresses = extractAllAddresses(d.to);
      const campaign = await findCampaignForRecipients(toAddresses);

      // The webhook payload is metadata-only — fetch the full email (body +
      // headers) from Resend using the matching campaign's own API key.
      const receivedEmailId = d.email_id || d.id;
      if (campaign && receivedEmailId && !d.text && !d.html) {
        try {
          const apiKey = decrypt(campaign.resendApiKeyEncrypted!);
          const full = await getReceivedEmail(apiKey, receivedEmailId);
          if (full) d = { ...d, ...full };
        } catch (err: any) {
          console.error('Failed to fetch received email content:', err?.message);
        }
      }

      const fromEmail = extractAddress(d.from);
      const toEmail = toAddresses[0] || extractAddress(d.to);
      const subject = d.subject || '';
      const body = d.text || d.plain_text || (d.html ? String(d.html).replace(/<[^>]+>/g, ' ') : '');
      const messageId =
        d.message_id || d.messageId || headerValue(d.headers, 'Message-ID') || undefined;
      const inReplyTo =
        d.in_reply_to || d.inReplyTo || headerValue(d.headers, 'In-Reply-To') || undefined;
      const references =
        d.references || headerValue(d.headers, 'References') || undefined;

      if (!fromEmail || !body) {
        return NextResponse.json({ success: true, skipped: 'Missing sender or body' });
      }

      // Ignore auto-responders / delivery notifications
      const junkSenders = ['mailer-daemon', 'postmaster', 'no-reply', 'noreply'];
      if (junkSenders.some(j => fromEmail.toLowerCase().includes(j))) {
        return NextResponse.json({ success: true, skipped: 'Automated sender' });
      }

      const result = await handleInboundReply({
        fromEmail,
        toEmail: toEmail || undefined,
        subject,
        body,
        messageId,
        inReplyTo,
        references,
        campaignId: campaign?.id
      });

      return NextResponse.json({ success: true, handled: 'email.received', replyId: result.replyId });
    }

    // Other event types (delivered, opened, …) are acknowledged and ignored
    return NextResponse.json({ success: true, ignored: type || 'unknown' });
  } catch (error: any) {
    console.error('Resend webhook error:', error);
    return NextResponse.json({ error: error.message || 'Webhook processing failed' }, { status: 500 });
  }
}
