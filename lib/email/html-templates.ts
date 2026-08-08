import { fillMergeTags, type MergeTagContext } from '@/lib/email/fill-merge-tags';
import { isHiringTrack } from '@/services/email-sequence-generator';
import {
  DEFAULT_TEMPLATE_ID,
  EMAIL_TEMPLATES,
  getTemplateMeta,
  renderEmailTemplate,
  resolveDesign,
  type EmailTemplateDesign,
} from '@/lib/email/email-templates';

/**
 * Campaign.htmlEmailTemplates holds one of two shapes:
 *
 *  v2 (current) — one universal built-in template for the whole campaign:
 *    { version: 2, templateId: "clean-card", design: { ...overrides } }
 *
 *  v1 (legacy)  — a raw HTML file uploaded per sequence step:
 *    { "1": { subject, html }, "2": { ... } }
 *
 * v1 is still read so campaigns configured before the template picker keep
 * sending, but the UI no longer creates it.
 */

export type HtmlStepTemplate = {
  subject: string;
  html: string;
};

/** @deprecated legacy per-step upload shape */
export type HtmlEmailTemplates = Record<string, HtmlStepTemplate>;

export type UniversalTemplateConfig = {
  version: 2;
  templateId: string;
  design: Partial<EmailTemplateDesign>;
};

const MAX_HTML_BYTES = 500_000;

const DESIGN_KEYS: (keyof EmailTemplateDesign)[] = [
  'accentColor',
  'backgroundColor',
  'contentBackground',
  'textColor',
  'headingColor',
  'buttonColor',
  'buttonTextColor',
  'buttonLabel',
  'buttonRadius',
  'fontFamily',
  'fontSize',
  'contentWidth',
  'headline',
  'brandName',
  'logoUrl',
  'footerText',
  'showButton',
  'showHeadline',
  'showLogo',
  'showFooter',
];

const NUMBER_KEYS = new Set(['buttonRadius', 'fontSize', 'contentWidth']);
const BOOLEAN_KEYS = new Set(['showButton', 'showHeadline', 'showLogo', 'showFooter']);

/** Keep only known design fields, with the right primitive types. */
export function sanitizeDesign(raw: unknown): Partial<EmailTemplateDesign> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DESIGN_KEYS) {
    const value = src[key];
    if (value === undefined || value === null) continue;
    if (NUMBER_KEYS.has(key)) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.round(n);
    } else if (BOOLEAN_KEYS.has(key)) {
      out[key] = Boolean(value);
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, 2000);
    }
  }
  return out as Partial<EmailTemplateDesign>;
}

/** Returns the universal template config, or null when the campaign has none. */
export function parseUniversalTemplate(raw: unknown): UniversalTemplateConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const templateId = typeof src.templateId === 'string' ? src.templateId : '';
  if (!templateId) return null;
  const known = EMAIL_TEMPLATES.some(t => t.id === templateId);
  return {
    version: 2,
    templateId: known ? templateId : DEFAULT_TEMPLATE_ID,
    design: sanitizeDesign(src.design),
  };
}

export function defaultUniversalTemplate(): UniversalTemplateConfig {
  return { version: 2, templateId: DEFAULT_TEMPLATE_ID, design: {} };
}

/** Wrap a lead's copy in the campaign's universal template. */
export function applyUniversalTemplate(
  config: UniversalTemplateConfig,
  opts: { subject: string; body: string; ctaUrl?: string },
  ctx: MergeTagContext
): { subject: string; body: string } {
  const html = renderEmailTemplate(config.templateId, config.design, {
    body: opts.body,
    ctaUrl: opts.ctaUrl,
  });
  return {
    subject: fillMergeTags(opts.subject, ctx),
    body: fillMergeTags(html, ctx),
  };
}

export function universalTemplateLabel(config: UniversalTemplateConfig): string {
  return getTemplateMeta(config.templateId).name;
}

export function resolvedDesignFor(config: UniversalTemplateConfig): EmailTemplateDesign {
  return resolveDesign(config.templateId, config.design);
}

// ─── Legacy v1 (per-step uploaded HTML) ─────────────────────────────────────

export function parseHtmlEmailTemplates(raw: unknown): HtmlEmailTemplates {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: HtmlEmailTemplates = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue;
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
        error: `This campaign uses a legacy per-step HTML setup that is missing Email ${step}. Pick a template from the gallery to switch to the new template system.`,
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
