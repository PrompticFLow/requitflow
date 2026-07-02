import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALENDAR_REDIRECT_URI
);

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

export async function getGoogleCalendarClient(userId: string) {
  const integration = await prisma.googleCalendarIntegration.findUnique({
    where: { userId }
  });

  if (!integration || !integration.connected || !integration.accessTokenEncrypted) {
    throw new Error('Google Calendar is not connected.');
  }

  const accessToken = decrypt(integration.accessTokenEncrypted);
  const refreshToken = integration.refreshTokenEncrypted ? decrypt(integration.refreshTokenEncrypted) : undefined;

  const client = getGoogleOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: integration.tokenExpiry ? integration.tokenExpiry.getTime() : undefined
  });

  // Handle token refresh automatically
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.googleCalendarIntegration.update({
        where: { userId },
        data: {
          accessTokenEncrypted: encrypt(tokens.access_token),
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          ...(tokens.refresh_token && { refreshTokenEncrypted: encrypt(tokens.refresh_token) })
        }
      });
    }
  });

  const calendar = google.calendar({ version: 'v3', auth: client });
  return { calendar, integration };
}

export interface AvailableSlotOptions {
  dateRangeStart: Date;
  dateRangeEnd: Date;
  durationMinutes?: number;
  timezone?: string;
}

export async function getAvailableSlots(userId: string, options: AvailableSlotOptions) {
  const { calendar, integration } = await getGoogleCalendarClient(userId);

  const duration = options.durationMinutes || integration.defaultDurationMinutes || 30;
  const tz = options.timezone || integration.timezone || 'America/New_York';
  const workingDays = integration.workingDays ? integration.workingDays.split(',') : ['MON','TUE','WED','THU','FRI'];
  const startHour = parseInt(integration.workingHourStart?.split(':')[0] || '9');
  const endHour = parseInt(integration.workingHourEnd?.split(':')[0] || '17');

  const freebusyResponse = await calendar.freebusy.query({
    requestBody: {
      timeMin: options.dateRangeStart.toISOString(),
      timeMax: options.dateRangeEnd.toISOString(),
      timeZone: tz,
      items: [{ id: integration.calendarId || 'primary' }]
    }
  });

  const busySlots = freebusyResponse.data.calendars?.[integration.calendarId || 'primary']?.busy || [];

  const availableSlots: { start: Date, end: Date, label: string }[] = [];
  const currentDate = new Date(options.dateRangeStart);
  
  // Very simplified slot generation logic (for a real app we'd use moment/date-fns to respect timezone properly)
  // Find slots at 30 min intervals
  while (currentDate < options.dateRangeEnd && availableSlots.length < 5) {
    const dayStr = currentDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz }).toUpperCase();
    const hour = parseInt(currentDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }));
    
    // Check if it's a working day and hour
    if (workingDays.includes(dayStr) && hour >= startHour && hour < endHour) {
      const slotEnd = new Date(currentDate.getTime() + duration * 60000);
      
      // Check if slot overlaps with busy
      const isBusy = busySlots.some(busy => {
        const bStart = new Date(busy.start!);
        const bEnd = new Date(busy.end!);
        return (currentDate < bEnd && slotEnd > bStart);
      });

      if (!isBusy) {
        // Apply buffer simplified: just skip 30 mins forward always anyway
        const label = currentDate.toLocaleString('en-US', { 
          weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz 
        });
        availableSlots.push({ start: new Date(currentDate), end: slotEnd, label });
      }
    }
    // Increment by 30 minutes
    currentDate.setMinutes(currentDate.getMinutes() + 30);
  }

  return availableSlots;
}

export interface BookEventOptions {
  start: Date;
  end: Date;
  summary: string;
  description: string;
  attendeeEmail: string;
  timezone?: string;
}

export async function bookCalendarEvent(userId: string, options: BookEventOptions) {
  const { calendar, integration } = await getGoogleCalendarClient(userId);

  const event = {
    summary: options.summary,
    description: options.description,
    start: {
      dateTime: options.start.toISOString(),
      timeZone: options.timezone || integration.timezone || 'America/New_York',
    },
    end: {
      dateTime: options.end.toISOString(),
      timeZone: options.timezone || integration.timezone || 'America/New_York',
    },
    attendees: [
      { email: options.attendeeEmail }
    ],
    conferenceData: {
      createRequest: {
        requestId: Math.random().toString(36).substring(7),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  const response = await calendar.events.insert({
    calendarId: integration.calendarId || 'primary',
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all'
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink
  };
}
