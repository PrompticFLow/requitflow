import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { getGmailOAuthClient, GMAIL_SCOPES } from '@/lib/gmail';

function decodeState(state: string | null): { userId?: string; campaignId?: string } {
  if (!state) return {};
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const url = new URL(req.url);

  // ── OAuth callback (no session required — identified by state) ─────────────
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const { userId, campaignId } = decodeState(url.searchParams.get('state'));

    const backTo = campaignId ? `/dashboard/campaigns/${campaignId}` : '/dashboard/settings';

    if (!code || !userId) {
      return NextResponse.redirect(new URL(`${backTo}?gmail=error`, req.url));
    }

    try {
      const client = getGmailOAuthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;
      if (!email || !tokens.access_token) {
        return NextResponse.redirect(new URL(`${backTo}?gmail=error`, req.url));
      }

      const account = await prisma.gmailAccount.upsert({
        where: { userId_email: { userId, email } },
        update: {
          accessTokenEncrypted: encrypt(tokens.access_token),
          ...(tokens.refresh_token && { refreshTokenEncrypted: encrypt(tokens.refresh_token) }),
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          displayName: userInfo.data.name || null,
          status: 'Active',
          lastError: null,
        },
        create: {
          userId,
          email,
          displayName: userInfo.data.name || null,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      });

      // Attach to the campaign the user connected from
      if (campaignId) {
        await prisma.campaign.updateMany({
          where: { id: campaignId, userId },
          data: { gmailAccountId: account.id },
        });
      }

      return NextResponse.redirect(new URL(`${backTo}?gmail=connected`, req.url));
    } catch (err: any) {
      console.error('Gmail OAuth callback error:', err);
      return NextResponse.redirect(new URL(`${backTo}?gmail=error`, req.url));
    }
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Start OAuth flow: /api/integrations/gmail/connect?campaignId=... ───────
  if (action === 'connect') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({
        error: 'Gmail is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.',
      }, { status: 400 });
    }

    const campaignId = url.searchParams.get('campaignId') || undefined;
    const state = Buffer.from(JSON.stringify({ userId: user.id, campaignId })).toString('base64url');

    const client = getGmailOAuthClient();
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
      state,
    });
    return NextResponse.redirect(authUrl);
  }

  // ── List connected accounts ────────────────────────────────────────────────
  if (action === 'accounts') {
    const accounts = await prisma.gmailAccount.findMany({
      where: { userId: user.id },
      select: {
        id: true, email: true, displayName: true, status: true,
        dailyLimit: true, lastSyncedAt: true, lastError: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ accounts });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ── Disconnect an account: POST /api/integrations/gmail/disconnect ───────────
export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await params;

  if (action === 'disconnect') {
    const body = await req.json().catch(() => ({}));
    const accountId = body.accountId;
    if (!accountId) return NextResponse.json({ error: 'accountId is required.' }, { status: 400 });

    const account = await prisma.gmailAccount.findFirst({ where: { id: accountId, userId: user.id } });
    if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });

    await prisma.campaign.updateMany({
      where: { gmailAccountId: accountId },
      data: { gmailAccountId: null },
    });
    await prisma.gmailAccount.delete({ where: { id: accountId } });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
