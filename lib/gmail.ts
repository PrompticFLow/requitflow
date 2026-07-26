// Gmail integration: per-campaign sending from the client's own Gmail account.
// Handles OAuth token refresh, raw MIME sending via the Gmail API, and inbox
// polling for reply + bounce detection.

import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile',
];

export function gmailRedirectUri(): string {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI
    || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/gmail/callback`;
}

export function getGmailOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    gmailRedirectUri()
  );
}

// Returns an authorized Gmail API client for a stored account.
// Refreshed access tokens are persisted back to the database automatically.
export async function getGmailClientForAccount(accountId: string) {
  const account = await prisma.gmailAccount.findUnique({ where: { id: accountId } });
  if (!account || account.status !== 'Active') {
    throw new Error('Gmail account is not connected or inactive.');
  }

  const client = getGmailOAuthClient();
  client.setCredentials({
    access_token: decrypt(account.accessTokenEncrypted),
    refresh_token: account.refreshTokenEncrypted ? decrypt(account.refreshTokenEncrypted) : undefined,
    expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
  });

  client.on('tokens', async (tokens) => {
    try {
      await prisma.gmailAccount.update({
        where: { id: account.id },
        data: {
          ...(tokens.access_token && { accessTokenEncrypted: encrypt(tokens.access_token) }),
          ...(tokens.refresh_token && { refreshTokenEncrypted: encrypt(tokens.refresh_token) }),
          ...(tokens.expiry_date && { tokenExpiry: new Date(tokens.expiry_date) }),
        },
      });
    } catch (e) {
      console.error('Failed to persist refreshed Gmail tokens:', e);
    }
  });

  return { gmail: google.gmail({ version: 'v1', auth: client }), account };
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function headerValue(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
  /** Gmail conversation thread — required for replies to stay in the same thread */
  threadId?: string;
  headers?: Record<string, string>;
}

export interface GmailThreadingInfo {
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

function normalizeRfcMessageId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

function looksLikeRfcMessageId(id: string): boolean {
  return id.includes('@') || (id.startsWith('<') && id.endsWith('>'));
}

/**
 * Resolves Gmail threadId + RFC822 Message-ID headers for a stored inbound id.
 * `storedMessageId` may be either a Gmail API message id (from pollGmailAccount)
 * or an RFC822 Message-ID (from IMAP / inbound email).
 */
export async function resolveGmailReplyThreading(
  accountId: string,
  storedMessageId: string
): Promise<GmailThreadingInfo> {
  const { gmail } = await getGmailClientForAccount(accountId);
  const id = storedMessageId.trim();
  if (!id) return {};

  try {
    if (!looksLikeRfcMessageId(id)) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References', 'In-Reply-To'],
      });
      const headers = full.data.payload?.headers || [];
      const rfcId = headerValue(headers, 'Message-ID');
      const existingRefs = headerValue(headers, 'References');
      const inReplyTo = headerValue(headers, 'In-Reply-To');
      const references = [existingRefs, inReplyTo, rfcId]
        .filter(Boolean)
        .map(normalizeRfcMessageId)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(' ');

      return {
        threadId: full.data.threadId || undefined,
        inReplyTo: rfcId ? normalizeRfcMessageId(rfcId) : undefined,
        references: references || undefined,
      };
    }

    const rfcId = normalizeRfcMessageId(id);
    const bare = rfcId.replace(/^<|>$/g, '');
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `rfc822msgid:${bare}`,
      maxResults: 1,
    });
    const gmailId = list.data.messages?.[0]?.id;
    let threadId: string | undefined;
    let references = rfcId;

    if (gmailId) {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: gmailId,
        format: 'metadata',
        metadataHeaders: ['References', 'In-Reply-To'],
      });
      threadId = full.data.threadId || undefined;
      const headers = full.data.payload?.headers || [];
      const existingRefs = headerValue(headers, 'References');
      const prevInReplyTo = headerValue(headers, 'In-Reply-To');
      references = [existingRefs, prevInReplyTo, rfcId]
        .filter(Boolean)
        .map(normalizeRfcMessageId)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(' ');
    }

    return { threadId, inReplyTo: rfcId, references };
  } catch (err) {
    console.error('Failed to resolve Gmail reply threading:', err);
    if (looksLikeRfcMessageId(id)) {
      const rfcId = normalizeRfcMessageId(id);
      return { inReplyTo: rfcId, references: rfcId };
    }
    return {};
  }
}

// Sends an email from the connected Gmail account using a raw MIME message.
export async function sendViaGmail(accountId: string, opts: GmailSendOptions) {
  const { gmail, account } = await getGmailClientForAccount(accountId);

  const from = opts.fromName
    ? `"${opts.fromName.replace(/"/g, '')}" <${account.email}>`
    : account.email;

  const extraHeaders = Object.entries(opts.headers || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');

  const boundary = `fz_${Date.now().toString(36)}`;
  const text = opts.text || opts.html.replace(/<[^>]+>/g, '');

  const mime = [
    `From: ${from}`,
    `To: ${opts.to}`,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : null,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
    extraHeaders || null,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    opts.html,
    '',
    `--${boundary}--`,
  ].filter(l => l !== null).join('\r\n');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: base64UrlEncode(mime),
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    },
  });

  return { messageId: res.data.id || undefined, threadId: res.data.threadId || undefined };
}

// Count emails sent today through a Gmail account (for its daily limit).
export async function gmailSentTodayCount(accountId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.emailSendLog.count({
    where: {
      status: 'Sent',
      sentAt: { gte: startOfDay },
      campaign: { gmailAccountId: accountId },
    },
  });
}

const BOUNCE_SENDERS = ['mailer-daemon', 'postmaster', 'mail delivery subsystem'];

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Walks a Gmail message payload and extracts the readable text body
// (prefers text/plain, falls back to stripped text/html).
function extractMessageBody(payload: any): string {
  if (!payload) return '';

  const collect = (part: any, mime: string): string | null => {
    if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
    for (const child of part.parts || []) {
      const found = collect(child, mime);
      if (found) return found;
    }
    return null;
  };

  const plain = collect(payload, 'text/plain');
  if (plain) return plain.trim();

  const html = collect(payload, 'text/html');
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

// Polls a Gmail inbox for new messages since the last sync:
//  - replies from leads → EmailReply rows + lead status "Replied"
//  - bounce notifications → lead status "Bounced" + EmailSendLog.bouncedAt
export async function pollGmailAccount(accountId: string) {
  const { gmail, account } = await getGmailClientForAccount(accountId);

  const sinceMs = account.lastSyncedAt ? account.lastSyncedAt.getTime() : Date.now() - 2 * 24 * 60 * 60 * 1000;
  const afterSeconds = Math.floor(sinceMs / 1000);

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: `in:inbox after:${afterSeconds}`,
    maxResults: 50,
  });

  let repliesFound = 0;
  let bouncesFound = 0;

  for (const msg of list.data.messages || []) {
    try {
      const full = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const headers = full.data.payload?.headers || [];
      const fromRaw = headerValue(headers, 'From');
      const fromEmail = extractEmailAddress(fromRaw);
      const subject = headerValue(headers, 'Subject');
      const rfcMessageId = headerValue(headers, 'Message-ID');
      // Prefer RFC822 Message-ID for In-Reply-To/References; fall back to Gmail id
      const storedMessageId = rfcMessageId || msg.id!;
      const snippet = full.data.snippet || '';

      // Skip if we already recorded this message (by RFC id or Gmail id)
      const seen = await prisma.emailReply.findFirst({
        where: {
          OR: [
            { messageId: storedMessageId },
            ...(msg.id ? [{ messageId: msg.id }] : []),
            ...(rfcMessageId ? [{ messageId: rfcMessageId }] : []),
          ],
        },
      });
      if (seen) continue;

      const isBounce = BOUNCE_SENDERS.some(s => fromRaw.toLowerCase().includes(s));

      if (isBounce) {
        // Try to find which lead bounced by matching an email address in the body/snippet
        const bounceTargets = await prisma.lead.findMany({
          where: {
            userId: account.userId,
            email: { not: null },
            emailSendLogs: { some: { sentAt: { gte: new Date(sinceMs - 7 * 24 * 60 * 60 * 1000) } } },
          },
          select: { id: true, email: true },
        });
        const target = bounceTargets.find(l => l.email && snippet.toLowerCase().includes(l.email.toLowerCase()));
        if (target) {
          await prisma.lead.update({ where: { id: target.id }, data: { status: 'Bounced', emailStatus: 'Bounced' } });
          await prisma.emailSendLog.updateMany({
            where: { leadId: target.id, bouncedAt: null },
            data: { status: 'Bounced', bouncedAt: new Date() },
          });
          await prisma.emailSequence.updateMany({
            where: { leadId: target.id, status: 'Queued' },
            data: { status: 'Cancelled', errorMessage: 'Email bounced' },
          });
          bouncesFound++;
        }
        continue;
      }

      // Reply detection: sender matches a lead we've emailed
      const lead = await prisma.lead.findFirst({
        where: { userId: account.userId, email: { equals: fromEmail, mode: 'insensitive' } },
        include: { campaignLeads: { take: 1, orderBy: { addedAt: 'desc' } } },
      });
      if (!lead) continue;

      const campaignId = lead.campaignLeads[0]?.campaignId || lead.campaignId || undefined;
      const fullBody = extractMessageBody(full.data.payload) || snippet;

      // Hand off to the AI reply handler: classifies intent, drafts/queues a
      // contextual response, stops follow-ups, and updates lead status.
      const { handleInboundReply } = await import('@/lib/reply-handler');
      const result = await handleInboundReply({
        fromEmail,
        toEmail: account.email,
        subject,
        body: fullBody,
        messageId: storedMessageId,
        campaignId,
        leadId: lead.id,
      });
      if (result.success) repliesFound++;
    } catch (err) {
      console.error('Failed to process Gmail message', msg.id, err);
    }
  }

  await prisma.gmailAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });

  return { repliesFound, bouncesFound, scanned: list.data.messages?.length || 0 };
}
