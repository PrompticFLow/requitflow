import { fillMergeTags, type MergeTagContext } from '@/lib/email/fill-merge-tags';
import { isHiringTrack } from '@/services/email-sequence-generator';

export type HtmlStepTemplate = {
  subject: string;
  html: string;
};

/** Campaign.htmlEmailTemplates shape: { "1": { subject, html }, ... } */
export type HtmlEmailTemplates = Record<string, HtmlStepTemplate>;

const MAX_HTML_BYTES = 500_000;

export function parseHtmlEmailTemplates(raw: unknown): HtmlEmailTemplates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HtmlEmailTemplates = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const subject = typeof v.subject === 'string' ? v.subject : '';
    const html = typeof v.html === 'string' ? v.html : '';
    if (subject.trim() || html.trim()) {
      out[key] = { subject, html };
    }
  }
  return out;
}

export function validateHtmlTemplatesForSteps(
  templates: HtmlEmailTemplates,
  stepCount: number
): { ok: true } | { ok: false; error: string } {
  for (let step = 1; step <= stepCount; step++) {
    const t = templates[String(step)];
    if (!t?.subject?.trim() || !t?.html?.trim()) {
      return {
        ok: false,
        error: `HTML mode requires a subject and HTML file for Email ${step}. Upload templates for every sequence step before generating.`,
      };
    }
    if (Buffer.byteLength(t.html, 'utf8') > MAX_HTML_BYTES) {
      return { ok: false, error: `Email ${step} HTML exceeds the ${MAX_HTML_BYTES / 1000}KB size limit.` };
    }
  }
  return { ok: true };
}

/** Cumulative send-day offsets matching the AI generator tracks. */
export function htmlTemplateDelayDays(lead: { hiringStatus?: string | null }, step: number, stepCount: number): number {
  const hiring = isHiringTrack(lead);
  const gaps = hiring ? [0, 2, 3, 4] : [0, 4, 5, 7];
  let day = 0;
  for (let i = 0; i < stepCount; i++) {
    day += gaps[Math.min(i, gaps.length - 1)];
    const delay = i === 0 ? 0 : day;
    if (i + 1 === step) return delay;
  }
  return 0;
}

export function applyHtmlTemplateForLead(
  template: HtmlStepTemplate,
  ctx: MergeTagContext
): { subject: string; body: string } {
  return {
    subject: fillMergeTags(template.subject.trim(), ctx),
    body: fillMergeTags(template.html.trim(), ctx),
  };
}

export function isHtmlBody(body: string | null | undefined): boolean {
  return !!body && /<[a-z][\s\S]*>/i.test(body);
}
