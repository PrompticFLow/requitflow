import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';

const AUTH_BASE = 'https://auth.calendly.com';
const API_BASE = 'https://api.calendly.com';

export function isCalendlyConfigured() {
  return Boolean(
    process.env.CALENDLY_CLIENT_ID &&
    process.env.CALENDLY_CLIENT_SECRET &&
    process.env.CALENDLY_REDIRECT_URI
  );
}

function originFromUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string): boolean {
  const hostname = host.replace(/^\[|\]$/g, '').split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
}

/**
 * Public site origin for post-OAuth redirects.
 * Never use `req.url` alone behind Railway: the process binds to PORT (often 8080),
 * so `new URL(path, req.url)` becomes `http://localhost:8080/...`.
 */
export function getPublicAppOrigin(req: Request): string {
  const envOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.CALENDLY_REDIRECT_URI,
  ];
  for (const value of envOrigins) {
    const origin = originFromUrl(value);
    if (!origin) continue;
    if (!isLoopbackHost(new URL(origin).host) || process.env.NODE_ENV !== 'production') {
      return origin;
    }
  }

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host') || '';
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (isLoopbackHost(host) ? 'http' : 'https');
  if (host && !isLoopbackHost(host)) {
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}

export function getCalendlyAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.CALENDLY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.CALENDLY_REDIRECT_URI!,
    state,
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

/** Encode OAuth state as base64url JSON: { userId, returnTo? } */
export function encodeCalendlyOAuthState(userId: string, returnTo?: string | null) {
  const payload = JSON.stringify({
    userId,
    ...(returnTo ? { returnTo } : {}),
  });
  return Buffer.from(payload).toString('base64url');
}

export function decodeCalendlyOAuthState(state: string): { userId: string; returnTo?: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    if (parsed?.userId) return { userId: parsed.userId, returnTo: parsed.returnTo };
  } catch {
    // Legacy plain userId
  }
  if (state && !state.includes('{')) return { userId: state };
  return null;
}

export function isSafeReturnTo(path: string | undefined): path is string {
  return Boolean(path && path.startsWith('/dashboard/') && !path.startsWith('//') && !path.includes('://'));
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  owner?: string;
  organization?: string;
  created_at?: number;
};

async function exchangeToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID!,
      client_secret: process.env.CALENDLY_CLIENT_SECRET!,
      ...body,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || 'Calendly token exchange failed');
  }
  return data as TokenResponse;
}

export async function exchangeCalendlyCode(code: string) {
  return exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.CALENDLY_REDIRECT_URI!,
  });
}

export async function refreshCalendlyToken(refreshToken: string) {
  return exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

async function calendlyFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.title || `Calendly API error (${res.status})`);
  }
  return data;
}

export async function getCalendlyCurrentUser(accessToken: string) {
  const data = await calendlyFetch(accessToken, '/users/me');
  return data.resource as {
    uri: string;
    email: string;
    name?: string;
    scheduling_url?: string;
    current_organization?: string;
  };
}

export async function listCalendlyEventTypes(accessToken: string, userUri: string) {
  const params = new URLSearchParams({ user: userUri, active: 'true', count: '20' });
  const data = await calendlyFetch(accessToken, `/event_types?${params.toString()}`);
  return (data.collection || []) as Array<{
    uri: string;
    name: string;
    scheduling_url: string;
    active: boolean;
    duration?: number;
  }>;
}

export async function listCalendlyScheduledEvents(
  accessToken: string,
  userUri: string,
  opts?: { minStartTime?: Date; maxStartTime?: Date; count?: number }
) {
  const params = new URLSearchParams({
    user: userUri,
    count: String(opts?.count ?? 50),
    status: 'active',
  });
  if (opts?.minStartTime) params.set('min_start_time', opts.minStartTime.toISOString());
  if (opts?.maxStartTime) params.set('max_start_time', opts.maxStartTime.toISOString());

  const data = await calendlyFetch(accessToken, `/scheduled_events?${params.toString()}`);
  return (data.collection || []) as Array<{
    uri: string;
    name: string;
    status: string;
    start_time: string;
    end_time: string;
    event_type: string;
    location?: { join_url?: string; type?: string };
  }>;
}

export async function listCalendlyEventInvitees(accessToken: string, eventUri: string) {
  const uuid = eventUri.split('/').pop();
  if (!uuid) return [];
  const params = new URLSearchParams({ count: '20' });
  const data = await calendlyFetch(
    accessToken,
    `/scheduled_events/${uuid}/invitees?${params.toString()}`
  );
  return (data.collection || []) as Array<{
    uri: string;
    email: string;
    name: string;
    status: string;
    timezone?: string;
    reschedule_url?: string;
    cancel_url?: string;
  }>;
}

/**
 * Pull recent Calendly scheduled events and upsert BookedCall rows matched by invitee email.
 */
export async function syncCalendlyBookingsForUser(userId: string): Promise<{ synced: number; matched: number }> {
  const integration = await prisma.calendlyIntegration.findUnique({ where: { userId } });
  if (!integration?.connected || !integration.calendlyUserUri) {
    return { synced: 0, matched: 0 };
  }

  const { accessToken } = await getCalendlyAccessToken(userId);

  // Look back 30 days and forward 90 days
  const minStart = new Date();
  minStart.setDate(minStart.getDate() - 30);
  const maxStart = new Date();
  maxStart.setDate(maxStart.getDate() + 90);

  const events = await listCalendlyScheduledEvents(accessToken, integration.calendlyUserUri, {
    minStartTime: minStart,
    maxStartTime: maxStart,
    count: 50,
  });

  let synced = 0;
  let matched = 0;

  for (const event of events) {
    if (event.status === 'canceled') continue;
    let invitees: Awaited<ReturnType<typeof listCalendlyEventInvitees>> = [];
    try {
      invitees = await listCalendlyEventInvitees(accessToken, event.uri);
    } catch (err) {
      console.warn('Failed to list invitees for', event.uri, err);
      continue;
    }

    for (const invitee of invitees) {
      if (invitee.status === 'canceled') continue;
      synced += 1;
      const email = (invitee.email || '').trim().toLowerCase();
      if (!email) continue;

      const lead = await prisma.lead.findFirst({
        where: {
          userId,
          email: { equals: email, mode: 'insensitive' },
        },
        include: {
          campaignLeads: { orderBy: { addedAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!lead) continue;
      matched += 1;

      const resolvedCampaignId =
        lead.campaignId || lead.campaignLeads[0]?.campaignId || null;

      const callDate = event.start_time ? new Date(event.start_time) : null;
      const bookingLink =
        invitee.reschedule_url ||
        event.location?.join_url ||
        integration.schedulingUrl ||
        invitee.uri ||
        null;

      const existing = await prisma.bookedCall.findFirst({
        where: {
          userId,
          leadId: lead.id,
          OR: [
            ...(callDate ? [{ callDate }] : []),
            ...(bookingLink ? [{ bookingLink }] : []),
            { notes: { contains: event.uri } },
          ],
        },
      });

      if (existing) {
        await prisma.bookedCall.update({
          where: { id: existing.id },
          data: {
            status: 'Scheduled',
            callDate: callDate || existing.callDate,
            bookingLink: bookingLink || existing.bookingLink,
            notes: `Calendly sync: ${invitee.name || email} | ${event.uri}`,
            ...(resolvedCampaignId && !existing.campaignId
              ? { campaignId: resolvedCampaignId }
              : {}),
          },
        });
      } else {
        await prisma.bookedCall.create({
          data: {
            userId,
            leadId: lead.id,
            campaignId: resolvedCampaignId,
            callDate,
            bookingLink,
            status: 'Scheduled',
            notes: `Calendly sync: ${invitee.name || email} | ${event.uri}`,
          },
        });
      }

      if (lead.status !== 'Booked' && lead.status !== 'Call Booked') {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'Booked', leadTier: 'Converted' },
        });
      }
      if (resolvedCampaignId) {
        await prisma.campaignLead.updateMany({
          where: { campaignId: resolvedCampaignId, leadId: lead.id },
          data: { status: 'Booked' },
        });
      }
    }
  }

  return { synced, matched };
}

export async function getCalendlyAccessToken(userId: string): Promise<{
  accessToken: string;
  integration: NonNullable<Awaited<ReturnType<typeof prisma.calendlyIntegration.findUnique>>>;
}> {
  const integration = await prisma.calendlyIntegration.findUnique({ where: { userId } });
  if (!integration?.connected || !integration.accessTokenEncrypted) {
    throw new Error('Calendly is not connected.');
  }

  let accessToken = decrypt(integration.accessTokenEncrypted);
  const expiresSoon =
    integration.tokenExpiry &&
    integration.tokenExpiry.getTime() < Date.now() + 60_000;

  if (expiresSoon && integration.refreshTokenEncrypted) {
    const refreshed = await refreshCalendlyToken(decrypt(integration.refreshTokenEncrypted));
    accessToken = refreshed.access_token;
    await prisma.calendlyIntegration.update({
      where: { userId },
      data: {
        accessTokenEncrypted: encrypt(refreshed.access_token),
        ...(refreshed.refresh_token && {
          refreshTokenEncrypted: encrypt(refreshed.refresh_token),
        }),
        tokenExpiry: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : null,
      },
    });
  }

  const fresh = await prisma.calendlyIntegration.findUnique({ where: { userId } });
  return { accessToken, integration: fresh! };
}

export function persistTokenFields(tokens: TokenResponse) {
  return {
    accessTokenEncrypted: encrypt(tokens.access_token),
    ...(tokens.refresh_token && { refreshTokenEncrypted: encrypt(tokens.refresh_token) }),
    tokenExpiry: tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null,
  };
}

export async function getConnectedSchedulingUrl(userId: string): Promise<string | null> {
  const integration = await prisma.calendlyIntegration.findUnique({ where: { userId } });
  if (integration?.connected && integration.schedulingUrl) {
    return integration.schedulingUrl;
  }
  return null;
}
