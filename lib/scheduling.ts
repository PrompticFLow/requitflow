/**
 * Basic heuristic function to find the next valid B2B sending window.
 * Avoids weekends. Prefers Tue-Thu.
 */
export function recommendNextSendTime(
  baseDate: Date,
  delayAmount: number,
  delayUnit: 'hours' | 'calendar_days' | 'business_days' | 'weeks',
  timezone: string = 'UTC',
  allowedSendingDays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  windowStart: string = '09:00',
  windowEnd: string = '16:00',
  skipHolidays: boolean = true
): { scheduledAt: Date; reason: string } {
  
  let targetDate = new Date(baseDate);

  // Helper to check if weekend
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  // Apply delays
  if (delayUnit === 'hours') {
    targetDate.setHours(targetDate.getHours() + delayAmount);
  } else if (delayUnit === 'calendar_days') {
    targetDate.setDate(targetDate.getDate() + delayAmount);
  } else if (delayUnit === 'weeks') {
    targetDate.setDate(targetDate.getDate() + (delayAmount * 7));
  } else if (delayUnit === 'business_days') {
    let daysAdded = 0;
    while (daysAdded < delayAmount) {
      targetDate.setDate(targetDate.getDate() + 1);
      if (!isWeekend(targetDate)) {
        daysAdded++;
      }
    }
  }

  // Adjust for allowed days
  let safeCount = 0;
  const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  while (!allowedSendingDays.includes(daysMap[targetDate.getDay()]) && safeCount < 14) {
    targetDate.setDate(targetDate.getDate() + 1);
    safeCount++;
  }

  // Determine ideal hour based on day of week heuristics
  const dayOfWeek = targetDate.getDay();
  let startHour = parseInt(windowStart.split(':')[0], 10) || 9;
  let startMin = parseInt(windowStart.split(':')[1], 10) || 0;

  let reason = 'Scheduled according to default campaign sending window.';

  if (dayOfWeek >= 2 && dayOfWeek <= 4) {
    // Tue, Wed, Thu -> primary B2B window 9:00 - 11:30
    startHour = 10; 
    startMin = 15;
    reason = 'Scheduled for mid-morning mid-week, the highest converting B2B engagement window.';
  } else if (dayOfWeek === 1) {
    // Monday -> 10:00 - 12:00
    startHour = 10;
    startMin = 30;
    reason = 'Scheduled later on Monday morning to avoid the early inbox rush.';
  } else if (dayOfWeek === 5) {
    // Friday -> 9:00 - 11:00
    startHour = 9;
    startMin = 45;
    reason = 'Scheduled early Friday morning before recipient attention drops off for the weekend.';
  }

  targetDate.setHours(startHour, startMin, 0, 0);

  return {
    scheduledAt: targetDate,
    reason: `${reason} (Timezone: ${timezone})`
  };
}

/**
 * PRD §4 default 5-step sequence delays.
 * Email 1: Day 0 (Intro)
 * Email 2: Day 2 (Follow-up)
 * Email 3: Day 5 (Problem-based)
 * Email 4: Day 8 (Benefit/proof)
 * Email 5: Day 12 (Final follow-up)
 */
export function getDefaultSequenceDelays() {
  return [
    { step: 1, delay: 0,  unit: 'business_days', name: 'Intro',              purpose: 'Personalized introduction with soft CTA.' },
    { step: 2, delay: 2,  unit: 'business_days', name: 'Follow-up',          purpose: 'Follow up and ask one simple question.' },
    { step: 3, delay: 3,  unit: 'business_days', name: 'Problem-based',      purpose: 'Address the main problem you solve.' },
    { step: 4, delay: 3,  unit: 'business_days', name: 'Benefit / Proof',    purpose: 'Highlight key benefit or case study if available.' },
    { step: 5, delay: 4,  unit: 'business_days', name: 'Final Follow-up',    purpose: 'Respectful last follow-up with easy opt-out.' },
  ];
}

/**
 * Legacy 7-step sequence delays — kept for backward compatibility.
 */
export function getSevenStepSequenceDelays() {
  return [
    { step: 1, delay: 0, unit: 'business_days' },
    { step: 2, delay: 2, unit: 'business_days' },
    { step: 3, delay: 3, unit: 'business_days' },
    { step: 4, delay: 3, unit: 'business_days' },
    { step: 5, delay: 3, unit: 'business_days' },
    { step: 6, delay: 3, unit: 'business_days' }, // Strict 3 day delay for the first follow-up sequence
    { step: 7, delay: 3, unit: 'business_days' },
  ];
}
