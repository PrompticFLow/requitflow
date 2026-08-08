/**
 * Fills any {{mergeTag}} placeholders the AI left in an email with real
 * lead/campaign values, so raw tokens like {{painPoints}}, {{desiredOutcome}}
 * or [Your Name] never reach a preview screen or a prospect's inbox. Unknown
 * tags are removed and the surrounding punctuation/whitespace is tidied up.
 *
 * This runs at three layers, so a raw token cannot survive to a preview:
 *   1. On every EmailSequence write  — Prisma extension in lib/prisma.ts
 *   2. On read in the review/preview endpoints — covers rows written earlier
 *   3. At send time — lib/email-dispatch.ts, lib/sendgrid.ts
 */

export interface MergeTagContext {
  lead?: any;
  campaign?: any;
  user?: any;
}

/**
 * Cheap detector used to skip the work (and the DB lookups needed to build a
 * context) for the overwhelmingly common case of clean copy.
 * Matches {{tag}}, {tag}, [Tag], <<tag>>, %%tag%% and FIRST_NAME style tokens.
 */
export function hasMergeTags(text: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  return /\{\{|\}\}|\{[^{}\n]{1,40}\}|\[[^\[\]\n]{1,40}\]|<<|%%|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(text);
}

/** Sign-offs we tidy when the sender name resolves to nothing. */
const SIGN_OFFS = 'Best|Best regards|Thanks|Thank you|Regards|Kind regards|Warm regards|Cheers|Sincerely|Talk soon';

/**
 * Placeholder for a tag that resolved to nothing. Marking the hole lets the
 * cleanup pass repair ONLY the text around a removed tag, so prose that
 * legitimately ends in "on." or "who should I reach out to?" is never mangled.
 */
const GAP = '\u0000';

export function fillMergeTags(text: string, ctx: MergeTagContext): string {
  if (!text || typeof text !== 'string') return text;
  if (!hasMergeTags(text)) return text;

  const lead = ctx?.lead || {};
  const campaign = ctx?.campaign || {};
  const user = ctx?.user || {};

  const firstName =
    lead.firstName ||
    (lead.fullName ? String(lead.fullName).trim().split(/\s+/)[0] : '') ||
    'there';
  const lastName = lead.lastName || '';
  const fullName = lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || firstName;
  const companyFallback = campaign.companyFallback || 'your team';
  const companyName = lead.businessName || companyFallback;
  const industry = lead.industry || campaign.targetIndustry || campaign.industry || 'your industry';
  const senderName =
    campaign.senderName || user.name || campaign.agencyName || campaign.clientName || '';
  const senderCompany = campaign.agencyName || campaign.clientName || senderName || 'our team';

  // Keys are normalized: lowercase, letters+digits only ("First Name" → "firstname")
  const values: Record<string, string> = {
    firstname: firstName,
    lastname: lastName,
    fullname: fullName,
    name: firstName,
    leadname: firstName,
    contactname: firstName,
    prospectname: firstName,
    recipientname: firstName,
    leademail: lead.email || '',
    email: lead.email || '',

    company: companyName,
    companyname: companyName,
    businessname: companyName,
    theircompany: companyName,
    leadcompany: companyName,
    prospectcompany: companyName,
    companyfallback: companyFallback,

    industry,
    targetindustry: industry,
    theirindustry: industry,

    jobtitle: lead.jobTitle || '',
    title: lead.jobTitle || '',
    role: lead.jobTitle || '',
    location: lead.location || campaign.location || campaign.targetLocation || '',
    city: lead.location || '',
    website: lead.website || '',

    painpoint: campaign.painPoints || 'the day-to-day challenges in your space',
    painpoints: campaign.painPoints || 'the day-to-day challenges in your space',
    desiredoutcome: campaign.desiredOutcome || campaign.mainBenefit || 'better results',
    outcome: campaign.desiredOutcome || campaign.mainBenefit || 'better results',
    mainbenefit: campaign.mainBenefit || campaign.desiredOutcome || 'real results',
    benefit: campaign.mainBenefit || campaign.desiredOutcome || 'real results',
    problemsolved: campaign.problemSolved || '',
    offer: campaign.offer || '',
    uniquemechanism: campaign.uniqueMechanism || 'our approach',
    proof: campaign.proofCaseStudy || campaign.proof || '',
    proofcasestudy: campaign.proofCaseStudy || campaign.proof || '',
    casestudy: campaign.proofCaseStudy || campaign.proof || '',
    targetaudience: campaign.targetAudience || '',
    goal: campaign.goal || campaign.bookingGoal || '',

    yourcompany: senderCompany,
    ourcompany: senderCompany,
    mycompany: senderCompany,
    agencyname: senderCompany,
    clientname: campaign.clientName || senderCompany,
    sendercompany: senderCompany,
    yourname: senderName,
    myname: senderName,
    sendername: senderName,
    senderemail: campaign.senderEmail || user.email || '',
    signature: campaign.emailSignature || '',
    emailsignature: campaign.emailSignature || '',
    yoursignature: campaign.emailSignature || '',
    unsubscribe: campaign.unsubscribeLine || '',
    unsubscribeline: campaign.unsubscribeLine || '',

    bookinglink: campaign.bookingLink || campaign.ctaLink || '',
    calendarlink: campaign.bookingLink || campaign.ctaLink || '',
    calendlylink: campaign.bookingLink || campaign.ctaLink || '',
    cta: campaign.ctaText || campaign.callToAction || '',
    calltoaction: campaign.ctaText || campaign.callToAction || '',
  };

  const normalizeKey = (raw: string) => String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  const isKnown = (raw: string) => normalizeKey(raw) in values;

  /**
   * Campaign answers are stored as standalone phrases ("More qualified booked
   * calls"), but they get dropped into the middle of a sentence. Lower-case the
   * lead character there so we don't produce "help you achieve More qualified…".
   * Only these keys qualify — names, companies and links keep their casing.
   */
  const isSentenceFragment = (key: string) =>
    ['painpoint', 'painpoints', 'desiredoutcome', 'outcome', 'mainbenefit', 'benefit',
     'problemsolved', 'offer', 'uniquemechanism', 'targetaudience', 'goal', 'industry',
     'targetindustry', 'theirindustry'].includes(key);

  const lookup = (raw: string, source?: string, offset?: number) => {
    const key = normalizeKey(raw);
    const value = values[key];
    if (!value) return GAP;

    if (isSentenceFragment(key) && /^[A-Z][a-z]/.test(value) && source !== undefined && offset !== undefined) {
      const before = source.slice(0, offset).replace(/[\s"'(]+$/, '');
      const midSentence = before.length > 0 && !/[.!?:;]$/.test(before);
      if (midSentence) return value.charAt(0).toLowerCase() + value.slice(1);
    }
    return value;
  };

  let out = text.split(GAP).join('');

  // {{anyTag}}, <<anyTag>>, %%anyTag%% — unknown tags are removed entirely.
  // These delimiters are never legitimate prose, so nothing real is lost.
  out = out.replace(/\{\{\s*([^{}]{1,60}?)\s*\}\}/g, (_m, raw, offset, src) => lookup(raw, src, offset));
  out = out.replace(/<<\s*([^<>]{1,60}?)\s*>>/g, (_m, raw, offset, src) => lookup(raw, src, offset));
  out = out.replace(/%%\s*([^%\n]{1,60}?)\s*%%/g, (_m, raw, offset, src) => lookup(raw, src, offset));

  // {tag} and [Tag] — replaced only when the token is a KNOWN merge key, so
  // legitimate text like "[Book a call](url)" stays untouched
  out = out.replace(/\{\s*([^{}\n]{1,40}?)\s*\}/g, (match, raw, offset, src) =>
    isKnown(raw) ? lookup(raw, src, offset) : match);
  out = out.replace(/\[\s*([^\[\]\n]{1,40}?)\s*\]/g, (match, raw, offset, src) =>
    isKnown(raw) ? lookup(raw, src, offset) : match);

  // SCREAMING_SNAKE tokens (FIRST_NAME, COMPANY_NAME, BOOKING_LINK, …).
  // Unknown ones are left alone — they are more likely to be real copy.
  out = out.replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, (match, offset, src) =>
    isKnown(match) ? lookup(match, src, offset) : match);

  // ── Repair the holes left by tags that resolved to nothing ───────────────
  out = out
    // a preposition/article stranded by a removed tag: "related to <gap>." → "related."
    .replace(/[ \t]*\b(?:to|for|with|at|in|on|of|about|like|the|a|an|and|your|their|our)\b[ \t]*\u0000/gi, '\u0000')
    // "()" / "[]" wrapped around nothing
    .replace(/[([]\s*\u0000\s*[)\]]/g, '\u0000')
    // drop the marker itself, absorbing one side of the surrounding spacing
    .replace(/[ \t]*\u0000[ \t]*([,.;:!?])/g, '$1')
    .replace(/[ \t]*\u0000[ \t]*/g, ' ')
    .replace(/\u0000/g, '')
    // general tidy
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    // an empty sign-off name leaves "Best,\n\n" — drop the trailing blank lines
    .replace(new RegExp(`\\n(${SIGN_OFFS}),?[ \\t]*\\n[\\s]*$`, 'i'), '\n$1,')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();

  return out;
}

/**
 * The user-visible content fields of an email draft.
 * `aiOriginalSubject` / `aiOriginalBody` are deliberately excluded — they are
 * the audit trail of what the model actually produced.
 */
export const EMAIL_CONTENT_FIELDS = [
  'subject',
  'body',
  'editedSubject',
  'editedBody',
  'previewText',
] as const;

/** Applies fillMergeTags to every content field of a draft-shaped object. */
export function fillMergeTagsInDraft<T extends Record<string, any>>(draft: T, ctx: MergeTagContext): T {
  if (!draft) return draft;

  let changed = false;
  const next: Record<string, any> = { ...draft };

  for (const field of EMAIL_CONTENT_FIELDS) {
    const value = next[field];
    if (typeof value !== 'string' || !hasMergeTags(value)) continue;
    const filled = fillMergeTags(value, ctx);
    if (filled !== value) {
      next[field] = filled;
      changed = true;
    }
  }

  return changed ? (next as T) : draft;
}

/** True when any user-visible content field still carries a raw merge tag. */
export function draftHasMergeTags(draft: Record<string, any> | null | undefined): boolean {
  if (!draft) return false;
  return EMAIL_CONTENT_FIELDS.some((field) => hasMergeTags(draft[field]));
}
