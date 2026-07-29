/**
 * Fills any {{mergeTag}} placeholders the AI left in an email with real
 * lead/campaign values, so raw tokens like {{targetIndustry}} or {{painPoints}}
 * never reach a prospect's inbox. Unknown tags are removed and the surrounding
 * punctuation/whitespace is tidied up.
 */

export interface MergeTagContext {
  lead?: any;
  campaign?: any;
  user?: any;
}

export function fillMergeTags(text: string, ctx: MergeTagContext): string {
  if (!text || !/\{\{|\{|\[/.test(text)) return text;

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
  const senderName = campaign.senderName || user.name || '';
  const senderCompany = campaign.agencyName || campaign.clientName || senderName || 'our team';

  // Keys are normalized: lowercase, letters+digits only ("First Name" → "firstname")
  const values: Record<string, string> = {
    firstname: firstName,
    lastname: lastName,
    fullname: fullName,
    name: firstName,
    leadname: firstName,

    company: companyName,
    companyname: companyName,
    businessname: companyName,
    theircompany: companyName,
    companyfallback: companyFallback,

    industry,
    targetindustry: industry,
    theirindustry: industry,

    jobtitle: lead.jobTitle || '',
    role: lead.jobTitle || '',
    location: lead.location || campaign.location || '',
    city: lead.location || '',

    painpoint: campaign.painPoints || 'the day-to-day challenges in your space',
    painpoints: campaign.painPoints || 'the day-to-day challenges in your space',
    desiredoutcome: campaign.desiredOutcome || campaign.mainBenefit || 'better results',
    mainbenefit: campaign.mainBenefit || campaign.desiredOutcome || 'real results',
    problemsolved: campaign.problemSolved || '',
    offer: campaign.offer || '',
    uniquemechanism: campaign.uniqueMechanism || 'our approach',
    proof: campaign.proofCaseStudy || campaign.proof || '',
    proofcasestudy: campaign.proofCaseStudy || campaign.proof || '',
    casestudy: campaign.proofCaseStudy || campaign.proof || '',
    targetaudience: campaign.targetAudience || '',

    yourcompany: senderCompany,
    ourcompany: senderCompany,
    mycompany: senderCompany,
    agencyname: senderCompany,
    sendercompany: senderCompany,
    yourname: senderName,
    myname: senderName,
    sendername: senderName,

    bookinglink: campaign.bookingLink || campaign.ctaLink || '',
    calendarlink: campaign.bookingLink || campaign.ctaLink || '',
    calendlylink: campaign.bookingLink || campaign.ctaLink || '',
    cta: campaign.ctaText || campaign.callToAction || '',
    calltoaction: campaign.ctaText || campaign.callToAction || '',
  };

  const normalizeKey = (raw: string) => String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');

  // {{anyTag}} — unknown tags are removed entirely (never show raw tokens)
  let out = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, raw) => values[normalizeKey(raw)] ?? '');

  // {tag} and [Tag] — replaced only when the token is a KNOWN merge key, so
  // legitimate text like "[Book a call](url)" links stays untouched
  out = out.replace(/\{\s*([^{}\n]{1,40}?)\s*\}/g, (match, raw) => {
    const key = normalizeKey(raw);
    return key in values ? values[key] : match;
  });
  out = out.replace(/\[\s*([^\[\]\n]{1,40}?)\s*\]/g, (match, raw) => {
    const key = normalizeKey(raw);
    return key in values ? values[key] : match;
  });

  // Tidy artifacts left by empty replacements: "with ." → "with.", double spaces
  out = out
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ');

  return out;
}
