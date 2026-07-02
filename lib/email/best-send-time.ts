export type SendTimeScore = {
  sendAt: Date;
  timezone: string;
  score: number;
  reason: string;
  sendWindow: string;
};

// Simple location to TZ mapper
function getLocationTimezone(location?: string | null): string | null {
  if (!location) return null;
  const loc = location.toLowerCase();
  if (loc.includes('new york')) return 'America/New_York';
  if (loc.includes('california') || loc.includes('los angeles') || loc.includes('san francisco')) return 'America/Los_Angeles';
  if (loc.includes('united states') || loc.includes('us') || loc.includes('usa')) return 'America/New_York';
  if (loc.includes('london') || loc.includes('uk') || loc.includes('united kingdom')) return 'Europe/London';
  if (loc.includes('india') || loc.includes('in')) return 'Asia/Kolkata';
  if (loc.includes('canada')) return 'America/Toronto';
  if (loc.includes('australia')) return 'Australia/Sydney';
  return null;
}

function getLocalParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    weekday: 'long',
    hour12: false
  }).formatToParts(date);
  
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: parseInt(map.year),
    month: parseInt(map.month) - 1,
    day: parseInt(map.day),
    hour: parseInt(map.hour),
    minute: parseInt(map.minute),
    weekday: map.weekday,
  };
}

function createDateInTz(baseTzDate: Date, hour: number, minute: number, tz: string): Date {
  const parts = getLocalParts(baseTzDate, tz);
  
  // Approximate by guessing and adjusting (handles DST nicely)
  let guess = new Date(Date.UTC(parts.year, parts.month, parts.day, hour, minute));
  
  for (let i = 0; i < 3; i++) {
    const gParts = getLocalParts(guess, tz);
    const hourDiff = hour - gParts.hour;
    const minDiff = minute - gParts.minute;
    if (hourDiff === 0 && minDiff === 0) break;
    guess = new Date(guess.getTime() + (hourDiff * 60 + minDiff) * 60000);
  }
  
  return guess;
}

export function calculateBestSendTime({
  leadLocation,
  campaignLocation,
  targetAudience,
  stepNumber,
  delayDays,
  lastEmailSentAt,
  preferredTimezone,
}: {
  leadLocation?: string | null;
  campaignLocation?: string | null;
  targetAudience?: string | null;
  stepNumber: number;
  delayDays: number;
  lastEmailSentAt?: Date | null;
  preferredTimezone?: string | null;
}) {
  const timezone = preferredTimezone 
    || getLocationTimezone(leadLocation) 
    || getLocationTimezone(campaignLocation)
    || 'America/New_York';

  let targetDate = new Date();
  
  if (delayDays > 0) {
    targetDate.setDate(targetDate.getDate() + delayDays);
  }

  // We need to score a few potential times on targetDate (and maybe targetDate+1 if it's weekend)
  const candidates: SendTimeScore[] = [];

  // Generate morning and afternoon candidates for today, tomorrow, and day after (to skip weekends)
  for (let d = 0; d < 4; d++) {
    const evalDate = new Date(targetDate.getTime() + d * 86400000);
    const evalParts = getLocalParts(evalDate, timezone);
    
    const isWeekend = evalParts.weekday === 'Saturday' || evalParts.weekday === 'Sunday';
    const isMidWeek = evalParts.weekday === 'Tuesday' || evalParts.weekday === 'Wednesday' || evalParts.weekday === 'Thursday';
    const isMonday = evalParts.weekday === 'Monday';
    const isFriday = evalParts.weekday === 'Friday';

    // Jitter: random between 3 and 17 minutes
    const morningJitter = Math.floor(Math.random() * (17 - 3 + 1)) + 3;
    const afternoonJitter = Math.floor(Math.random() * (17 - 3 + 1)) + 3;

    // Morning: 10:00 + jitter
    const morningDate = createDateInTz(evalDate, 10, morningJitter, timezone);
    // Afternoon: 14:30 + jitter
    const afternoonDate = createDateInTz(evalDate, 14, 30 + afternoonJitter, timezone);

    // Score morning
    let mScore = 100;
    let mReason = "Scheduled during lead's local morning business window with safe spacing.";
    if (isWeekend) mScore -= 100;
    if (isMidWeek) mScore += 20;
    if (isMonday) mScore -= 10;
    
    // spacing check
    if (lastEmailSentAt && (morningDate.getTime() - lastEmailSentAt.getTime() < 12 * 3600000)) {
      mScore -= 50;
      mReason = "Penalized for being too close to previous email.";
    }

    // skip past times
    if (morningDate.getTime() <= new Date().getTime()) {
      mScore = -1000; 
    }

    candidates.push({
      sendAt: morningDate,
      timezone,
      score: mScore,
      reason: mReason,
      sendWindow: 'morning'
    });

    // Score afternoon
    let aScore = 90;
    let aReason = "Scheduled during lead's local afternoon business window with safe spacing.";
    if (isWeekend) aScore -= 100;
    if (isMidWeek) aScore += 20;
    if (isFriday) aScore -= 20;

    // spacing check
    if (lastEmailSentAt && (afternoonDate.getTime() - lastEmailSentAt.getTime() < 12 * 3600000)) {
      aScore -= 50;
      aReason = "Penalized for being too close to previous email.";
    }

    if (afternoonDate.getTime() <= new Date().getTime()) {
      aScore = -1000;
    }

    candidates.push({
      sendAt: afternoonDate,
      timezone,
      score: aScore,
      reason: aReason,
      sendWindow: 'afternoon'
    });
  }

  // Sort by score DESC, pick highest
  candidates.sort((a, b) => b.score - a.score);
  
  return candidates[0];
}
