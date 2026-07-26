import { NextResponse } from 'next/server';
import { getGoogleOAuthClient, getGoogleCalendarClient, getAvailableSlots, bookCalendarEvent } from '@/lib/google-calendar';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { google } from 'googleapis';

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  
  if (action === 'callback') {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const userId = url.searchParams.get('state');

    if (!code || !userId) return NextResponse.redirect(new URL('/dashboard/settings?error=missing_code', req.url));

    try {
      const client = getGoogleOAuthClient();
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      
      await prisma.googleCalendarIntegration.upsert({
        where: { userId },
        update: {
          googleEmail: userInfo.data.email,
          accessTokenEncrypted: tokens.access_token ? encrypt(tokens.access_token) : undefined,
          ...(tokens.refresh_token && { refreshTokenEncrypted: encrypt(tokens.refresh_token) }),
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connected: true
        },
        create: {
          userId,
          googleEmail: userInfo.data.email,
          accessTokenEncrypted: tokens.access_token ? encrypt(tokens.access_token) : undefined,
          refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connected: true
        }
      });

      return NextResponse.redirect(new URL('/dashboard/settings?calendar=connected', req.url));
    } catch (err: any) {
      console.error(err);
      return NextResponse.redirect(new URL('/dashboard/settings?error=calendar_failed', req.url));
    }
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (action === 'connect') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALENDAR_REDIRECT_URI) {
      console.error("Google Calendar OAuth config missing", {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        hasRedirectUri: Boolean(process.env.GOOGLE_CALENDAR_REDIRECT_URI),
      });
      return NextResponse.json({
        success: false,
        error: "Google Calendar is not configured. Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_CALENDAR_REDIRECT_URI."
      }, { status: 400 });
    }

    const client = getGoogleOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'openid',
        'email',
        'profile'
      ],
      state: user.id
    });
    return NextResponse.redirect(url);
  }

  if (action === 'status') {
    const integration = await prisma.googleCalendarIntegration.findUnique({ where: { userId: user.id } });
    if (!integration) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: integration.connected,
      googleEmail: integration.googleEmail,
      calendarId: integration.calendarId,
      defaultDurationMinutes: integration.defaultDurationMinutes,
      timezone: integration.timezone,
      workingDays: integration.workingDays,
      workingHourStart: integration.workingHourStart,
      workingHourEnd: integration.workingHourEnd,
      bufferMinutes: integration.bufferMinutes
    });
  }

  if (action === 'calendars') {
    try {
      const { calendar } = await getGoogleCalendarClient(user.id);
      const res = await calendar.calendarList.list();
      return NextResponse.json({ calendars: res.data.items });
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

  if (action === 'settings') {
    const data = await req.json();
    const integration = await prisma.googleCalendarIntegration.update({
      where: { userId: user.id },
      data: {
        calendarId: data.calendarId,
        defaultDurationMinutes: data.defaultDurationMinutes,
        timezone: data.timezone,
        workingDays: data.workingDays,
        workingHourStart: data.workingHourStart,
        workingHourEnd: data.workingHourEnd,
        bufferMinutes: data.bufferMinutes
      }
    });
    return NextResponse.json({ success: true, integration });
  }

  if (action === 'disconnect') {
    await prisma.googleCalendarIntegration.update({
      where: { userId: user.id },
      data: {
        connected: false,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiry: null
      }
    });
    return NextResponse.json({ success: true });
  }

  if (action === 'available-slots') {
    const data = await req.json();
    try {
      const slots = await getAvailableSlots(user.id, {
        dateRangeStart: new Date(data.dateRangeStart),
        dateRangeEnd: new Date(data.dateRangeEnd),
        durationMinutes: data.durationMinutes,
        timezone: data.timezone
      });
      return NextResponse.json({ success: true, slots });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  if (action === 'book') {
    const data = await req.json();
    try {
      // Create Event
      const result = await bookCalendarEvent(user.id, {
        start: new Date(data.start),
        end: new Date(data.end),
        summary: data.summary,
        description: data.description,
        attendeeEmail: data.attendeeEmail,
        timezone: data.timezone
      });

      // Update DB Status
      if (data.replyId) {
        await prisma.emailReply.update({
          where: { id: data.replyId },
          data: { bookedCall: true }
        });
      }

      if (data.leadId) {
        await prisma.lead.update({
          where: { id: data.leadId },
          data: { status: 'Booked' }
        });
        
        // Stop future emails if booked
        if (data.campaignId) {
           await prisma.emailSequence.updateMany({
             where: { campaignId: data.campaignId, leadId: data.leadId, status: { in: ['Draft', 'Pending', 'Scheduled'] } },
             data: { status: 'Skipped' }
           });
           await prisma.campaignLead.updateMany({
             where: { campaignId: data.campaignId, leadId: data.leadId },
             data: { status: 'Booked' },
           });
        }

        const existingCall = await prisma.bookedCall.findFirst({
          where: {
            userId: user.id,
            leadId: data.leadId,
            status: { in: ['Scheduled', 'Confirmed', 'Booked'] },
          },
        });
        if (!existingCall) {
          await prisma.bookedCall.create({
            data: {
              userId: user.id,
              leadId: data.leadId,
              campaignId: data.campaignId || null,
              callDate: new Date(data.start),
              status: 'Booked',
              notes: data.summary || 'Booked via Google Calendar',
            },
          });
        }
      }

      return NextResponse.json({ success: true, ...result, message: 'Call booked successfully.' });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
