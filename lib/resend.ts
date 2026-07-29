import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface CampaignResendSender {
  apiKey: string;
  fromEmail: string;
}

/**
 * Resolves the Resend credentials configured on a campaign.
 * Returns null when the campaign has no Resend API key / sender email yet.
 */
export function getCampaignResendSender(campaign: {
  resendApiKeyEncrypted?: string | null;
  resendFromEmail?: string | null;
}): CampaignResendSender | null {
  if (!campaign?.resendApiKeyEncrypted || !campaign?.resendFromEmail) return null;
  try {
    const apiKey = decrypt(campaign.resendApiKeyEncrypted);
    if (!apiKey) return null;
    return { apiKey, fromEmail: campaign.resendFromEmail };
  } catch {
    return null;
  }
}

/**
 * Sends a single email through the Resend API.
 * Reply threading is preserved by passing In-Reply-To / References headers.
 */
export async function sendViaResend(
  apiKey: string,
  { to, subject, html, text, fromEmail, fromName, replyTo, headers }: ResendSendOptions
): Promise<{ messageId: string }> {
  const from = fromName ? `${fromName.replace(/"/g, '')} <${fromEmail}>` : fromEmail;

  const payload: any = {
    from,
    to: [to],
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  };
  if (replyTo) payload.reply_to = [replyTo];
  if (headers && Object.keys(headers).length > 0) payload.headers = headers;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.message || `Resend API error (${res.status})`;
    if (res.status === 401 || res.status === 403) {
      throw new Error('Invalid Resend API key. Update the key in this campaign\'s Sending Account settings.');
    }
    if (res.status === 422 && /domain/i.test(message)) {
      throw new Error(`Resend rejected the sender address: ${message}. Verify the domain of ${fromEmail} in your Resend dashboard.`);
    }
    if (res.status === 429) {
      throw new Error('Resend rate limit reached. Please try again later.');
    }
    throw new Error(message);
  }

  return { messageId: data?.id || '' };
}

/**
 * Validates a Resend API key by listing domains (read-only, sends nothing).
 * Returns { valid: false, error } only on an explicit auth rejection —
 * network hiccups do not block saving the key.
 */
export async function validateResendApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: 'This Resend API key was rejected. Double-check the key (it should start with "re_").' };
    }
    return { valid: true };
  } catch {
    return { valid: true };
  }
}

/**
 * Ensures a Resend webhook exists (in the customer's own Resend account)
 * pointing at our app, subscribed to inbound replies and bounces. Idempotent:
 * reuses an existing webhook for the same endpoint. Returns null on failure —
 * webhook setup is best-effort and must never block saving the API key.
 */
export async function ensureResendWebhook(
  apiKey: string,
  endpointUrl: string
): Promise<{ webhookId: string; signingSecret: string | null } | null> {
  const authHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  try {
    // Reuse an existing webhook for this endpoint if one exists
    const listRes = await fetch('https://api.resend.com/webhooks', { headers: authHeaders });
    if (listRes.ok) {
      const list = await listRes.json().catch(() => ({}));
      const existing = (list?.data || list?.webhooks || []).find?.(
        (w: any) => w?.endpoint === endpointUrl
      );
      if (existing?.id) {
        return { webhookId: existing.id, signingSecret: null }; // secret only returned at creation
      }
    }

    const createRes = await fetch('https://api.resend.com/webhooks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        endpoint: endpointUrl,
        events: ['email.received', 'email.bounced', 'email.complained'],
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      console.error('Resend webhook creation failed:', createRes.status, err?.message);
      return null;
    }
    const created = await createRes.json().catch(() => ({}));
    if (!created?.id) return null;
    return { webhookId: created.id, signingSecret: created.signing_secret || null };
  } catch (err: any) {
    console.error('Resend webhook setup error:', err?.message);
    return null;
  }
}

/**
 * Fetches the full content of a received (inbound) email. The email.received
 * webhook only carries metadata — body/headers come from this endpoint.
 */
export async function getReceivedEmail(apiKey: string, receivedEmailId: string): Promise<any | null> {
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${receivedEmailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Number of emails already sent today for a campaign (daily-limit enforcement).
 */
export async function campaignSentTodayCount(campaignId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.emailSendLog.count({
    where: {
      status: 'Sent',
      sentAt: { gte: startOfDay },
      campaignId,
    },
  });
}

/**
 * Threading headers for an outbound reply, based on the most recent inbound
 * message we captured for this lead + campaign.
 */
export async function resolveReplyThreadingHeaders(
  campaignId: string,
  leadId: string
): Promise<Record<string, string>> {
  const inbound = await prisma.emailReply.findFirst({
    where: {
      campaignId,
      leadId,
      messageId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { messageId: true },
  });
  if (!inbound?.messageId) return {};
  return {
    'In-Reply-To': inbound.messageId,
    References: inbound.messageId,
  };
}
