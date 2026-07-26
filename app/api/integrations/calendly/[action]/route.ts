import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  isCalendlyConfigured,
  getCalendlyAuthorizeUrl,
  exchangeCalendlyCode,
  getCalendlyCurrentUser,
  listCalendlyEventTypes,
  getCalendlyAccessToken,
  persistTokenFields,
  encodeCalendlyOAuthState,
  decodeCalendlyOAuthState,
  isSafeReturnTo,
  syncCalendlyBookingsForUser,
} from '@/lib/calendly';

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  if (action === 'callback') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const rawState = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    const decoded = rawState ? decodeCalendlyOAuthState(rawState) : null;
    const userId = decoded?.userId;
    const returnTo = isSafeReturnTo(decoded?.returnTo) ? decoded!.returnTo! : '/dashboard/settings';
    const successRedirect = returnTo.includes('?')
      ? `${returnTo}&calendly=connected`
      : `${returnTo}?calendly=connected`;
    const errorRedirectBase = returnTo.startsWith('/dashboard/campaigns/')
      ? returnTo
      : '/dashboard/settings';

    if (oauthError) {
      return NextResponse.redirect(new URL(`${errorRedirectBase}?error=calendly_${oauthError}`, req.url));
    }
    if (!code || !userId) {
      return NextResponse.redirect(new URL(`${errorRedirectBase}?error=calendly_missing_code`, req.url));
    }

    try {
      if (!isCalendlyConfigured()) {
        return NextResponse.redirect(new URL(`${errorRedirectBase}?error=calendly_not_configured`, req.url));
      }

      const tokens = await exchangeCalendlyCode(code);
      const me = await getCalendlyCurrentUser(tokens.access_token);
      const eventTypes = await listCalendlyEventTypes(tokens.access_token, me.uri).catch(() => []);
      const schedulingUrl =
        eventTypes.find((e) => e.active && e.scheduling_url)?.scheduling_url ||
        me.scheduling_url ||
        null;

      const tokenFields = persistTokenFields(tokens);

      await prisma.calendlyIntegration.upsert({
        where: { userId },
        update: {
          calendlyUserUri: me.uri,
          calendlyEmail: me.email,
          organizationUri: me.current_organization || null,
          schedulingUrl,
          connected: true,
          ...tokenFields,
        },
        create: {
          userId,
          calendlyUserUri: me.uri,
          calendlyEmail: me.email,
          organizationUri: me.current_organization || null,
          schedulingUrl,
          connected: true,
          ...tokenFields,
        },
      });

      if (schedulingUrl) {
        const settings = await prisma.userSettings.findUnique({ where: { userId } });
        if (settings && !settings.bookingLink) {
          await prisma.userSettings.update({
            where: { userId },
            data: { bookingLink: schedulingUrl },
          });
        } else if (!settings) {
          await prisma.userSettings.create({
            data: { userId, bookingLink: schedulingUrl },
          });
        }

        // If returning to a campaign, apply scheduling URL when campaign has no booking link
        const campaignMatch = returnTo.match(/^\/dashboard\/campaigns\/([^/?]+)/);
        if (campaignMatch) {
          const campaignId = campaignMatch[1];
          const campaign = await prisma.campaign.findFirst({
            where: { id: campaignId, userId },
          });
          if (campaign && !campaign.bookingLink && !campaign.ctaLink) {
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { bookingLink: schedulingUrl, ctaLink: schedulingUrl },
            });
          }
        }
      }

      return NextResponse.redirect(new URL(successRedirect, req.url));
    } catch (err) {
      console.error('Calendly OAuth callback failed:', err);
      return NextResponse.redirect(new URL(`${errorRedirectBase}?error=calendly_failed`, req.url));
    }
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (action === 'connect') {
    if (!isCalendlyConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Calendly is not configured. Missing CALENDLY_CLIENT_ID, CALENDLY_CLIENT_SECRET, or CALENDLY_REDIRECT_URI.',
      }, { status: 400 });
    }
    const url = new URL(req.url);
    const returnTo = url.searchParams.get('returnTo');
    const state = encodeCalendlyOAuthState(user.id, isSafeReturnTo(returnTo || undefined) ? returnTo : null);
    const authUrl = getCalendlyAuthorizeUrl(state);
    const accept = req.headers.get('accept') || '';
    if (accept.includes('application/json')) {
      return NextResponse.json({ url: authUrl });
    }
    return NextResponse.redirect(authUrl);
  }

  if (action === 'status') {
    const integration = await prisma.calendlyIntegration.findUnique({ where: { userId: user.id } });
    if (!integration) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: integration.connected,
      calendlyEmail: integration.calendlyEmail,
      schedulingUrl: integration.schedulingUrl,
      organizationUri: integration.organizationUri,
    });
  }

  if (action === 'event-types') {
    try {
      const { accessToken, integration } = await getCalendlyAccessToken(user.id);
      if (!integration.calendlyUserUri) {
        return NextResponse.json({ error: 'Missing Calendly user URI' }, { status: 400 });
      }
      const eventTypes = await listCalendlyEventTypes(accessToken, integration.calendlyUserUri);
      return NextResponse.json({ eventTypes });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await params;

  if (action === 'disconnect') {
    const integration = await prisma.calendlyIntegration.findUnique({ where: { userId: user.id } });

    if (integration) {
      await prisma.calendlyIntegration.update({
        where: { userId: user.id },
        data: {
          connected: false,
          accessTokenEncrypted: null,
          refreshTokenEncrypted: null,
          tokenExpiry: null,
        },
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'set-scheduling-url') {
    const data = await req.json();
    const schedulingUrl = typeof data.schedulingUrl === 'string' ? data.schedulingUrl : null;
    await prisma.calendlyIntegration.update({
      where: { userId: user.id },
      data: { schedulingUrl },
    });
    if (schedulingUrl) {
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { bookingLink: schedulingUrl },
        create: { userId: user.id, bookingLink: schedulingUrl },
      });
    }
    return NextResponse.json({ success: true, schedulingUrl });
  }

  if (action === 'sync') {
    try {
      const integration = await prisma.calendlyIntegration.findUnique({
        where: { userId: user.id },
      });
      if (!integration?.connected) {
        return NextResponse.json({ error: 'Calendly is not connected.' }, { status: 400 });
      }
      const result = await syncCalendlyBookingsForUser(user.id);
      return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
