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

export interface GmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
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
    requestBody: { raw: base64UrlEncode(mime) },
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

function headerValue(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
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
      const snippet = full.data.snippet || '';

      // Skip if we already recorded this message
      const seen = await prisma.emailReply.findFirst({ where: { messageId: msg.id! } });
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

      const campaignId = lead.campaignLeads[0]?.campaignId || lead.campaignId || null;

      await prisma.emailReply.create({
        data: {
          userId: account.userId,
          campaignId,
          leadId: lead.id,
          fromEmail,
          toEmail: account.email,
          subject,
          body: snippet,
          messageId: msg.id!,
          status: 'Unread',
        },
      });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'Replied' } });
      await prisma.emailSequence.updateMany({
        where: { leadId: lead.id, status: 'Queued' },
        data: { status: 'Cancelled', errorMessage: 'Stopped because lead replied.' },
      });
      repliesFound++;
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
