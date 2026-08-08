/**
 * Built-in email template designs.
 *
 * One universal template per campaign: the AI still writes the copy for every
 * lead / sequence step, and the selected template controls how that copy looks.
 * Users pick from this catalog and tweak colours, fonts, button and branding —
 * they never upload raw HTML.
 *
 * This module is framework-free so it can be imported from both the API routes
 * and the client-side picker modal (for live preview).
 */

export type EmailTemplateDesign = {
  accentColor: string;
  backgroundColor: string;
  contentBackground: string;
  textColor: string;
  headingColor: string;
  buttonColor: string;
  buttonTextColor: string;
  buttonLabel: string;
  buttonRadius: number;
  fontFamily: string;
  fontSize: number;
  contentWidth: number;
  headline: string;
  brandName: string;
  logoUrl: string;
  footerText: string;
  showButton: boolean;
  showHeadline: boolean;
  showLogo: boolean;
  showFooter: boolean;
};

export type EmailTemplateMeta = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Design overrides applied when this template is first selected. */
  defaults: Partial<EmailTemplateDesign>;
};

export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Helvetica / Arial', value: "Helvetica, Arial, sans-serif" },
  { label: 'Arial', value: "Arial, Helvetica, sans-serif" },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Verdana', value: "Verdana, Geneva, sans-serif" },
  { label: 'Tahoma', value: "Tahoma, Verdana, sans-serif" },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: 'Courier New (mono)', value: "'Courier New', Courier, monospace" },
];

/** Quick-pick brand palettes, GHL-style. */
export const COLOR_PRESETS: { name: string; accent: string; button: string; background: string }[] = [
  { name: 'Purple', accent: '#7c3aed', button: '#7c3aed', background: '#f5f3ff' },
  { name: 'Blue', accent: '#2563eb', button: '#2563eb', background: '#eff6ff' },
  { name: 'Emerald', accent: '#059669', button: '#059669', background: '#ecfdf5' },
  { name: 'Orange', accent: '#ea580c', button: '#ea580c', background: '#fff7ed' },
  { name: 'Rose', accent: '#e11d48', button: '#e11d48', background: '#fff1f2' },
  { name: 'Slate', accent: '#0f172a', button: '#0f172a', background: '#f1f5f9' },
];

export const DEFAULT_DESIGN: EmailTemplateDesign = {
  accentColor: '#7c3aed',
  backgroundColor: '#f4f5f7',
  contentBackground: '#ffffff',
  textColor: '#374151',
  headingColor: '#111827',
  buttonColor: '#7c3aed',
  buttonTextColor: '#ffffff',
  buttonLabel: 'Book a 15-min call',
  buttonRadius: 8,
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSize: 16,
  contentWidth: 600,
  headline: '',
  brandName: '',
  logoUrl: '',
  footerText: 'You received this email because we thought it might be relevant to you.',
  showButton: true,
  showHeadline: false,
  showLogo: false,
  showFooter: true,
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: 'plain-personal',
    name: 'Plain & Personal',
    category: 'Cold outreach',
    description: 'Looks like a normal 1:1 email from a person. Highest reply rates for cold outreach.',
    defaults: {
      backgroundColor: '#ffffff',
      contentBackground: '#ffffff',
      textColor: '#1f2937',
      showButton: false,
      showFooter: false,
      showHeadline: false,
      contentWidth: 560,
    },
  },
  {
    id: 'clean-card',
    name: 'Clean Card',
    category: 'Cold outreach',
    description: 'White card on a soft background with a thin accent bar on top.',
    defaults: {
      backgroundColor: '#f4f5f7',
      contentBackground: '#ffffff',
      showButton: true,
      showFooter: true,
    },
  },
  {
    id: 'accent-rule',
    name: 'Accent Rule',
    category: 'Cold outreach',
    description: 'Minimal layout with a coloured left rule down the message.',
    defaults: {
      backgroundColor: '#ffffff',
      contentBackground: '#ffffff',
      showButton: true,
      showFooter: false,
    },
  },
  {
    id: 'bold-header',
    name: 'Bold Header',
    category: 'Branded',
    description: 'Full-width coloured header band with your brand name or logo.',
    defaults: {
      backgroundColor: '#f4f5f7',
      contentBackground: '#ffffff',
      showLogo: true,
      showHeadline: true,
      headline: 'A quick idea for {{companyName}}',
      showButton: true,
      showFooter: true,
    },
  },
  {
    id: 'corporate',
    name: 'Corporate',
    category: 'Branded',
    description: 'Formal layout with header rule, boxed content and a footer signature block.',
    defaults: {
      accentColor: '#1d4ed8',
      buttonColor: '#1d4ed8',
      backgroundColor: '#eef2f7',
      contentBackground: '#ffffff',
      fontFamily: "Georgia, 'Times New Roman', serif",
      showLogo: true,
      showButton: true,
      showFooter: true,
    },
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    category: 'Nurture',
    description: 'Header, divider and footer — good for value-add nurture touches.',
    defaults: {
      backgroundColor: '#f8fafc',
      contentBackground: '#ffffff',
      showLogo: true,
      showHeadline: true,
      headline: 'Hi {{firstName}} — a few thoughts',
      showButton: true,
      showFooter: true,
    },
  },
  {
    id: 'gradient-cta',
    name: 'Gradient CTA',
    category: 'Conversion',
    description: 'Gradient hero header with a large centred call-to-action button.',
    defaults: {
      backgroundColor: '#f1f5f9',
      contentBackground: '#ffffff',
      showHeadline: true,
      headline: "Let's talk, {{firstName}}",
      showButton: true,
      showFooter: true,
      buttonRadius: 999,
    },
  },
  {
    id: 'dark-modern',
    name: 'Dark Modern',
    category: 'Conversion',
    description: 'Dark background with light type — stands out in a crowded inbox.',
    defaults: {
      accentColor: '#a78bfa',
      backgroundColor: '#0b1120',
      contentBackground: '#111827',
      textColor: '#d1d5db',
      headingColor: '#ffffff',
      buttonColor: '#a78bfa',
      buttonTextColor: '#0b1120',
      showHeadline: true,
      headline: 'Worth 15 minutes?',
      showButton: true,
      showFooter: true,
    },
  },
];

export const DEFAULT_TEMPLATE_ID = 'clean-card';

export function getTemplateMeta(templateId: string | null | undefined): EmailTemplateMeta {
  return (
    EMAIL_TEMPLATES.find(t => t.id === templateId) ||
    EMAIL_TEMPLATES.find(t => t.id === DEFAULT_TEMPLATE_ID) ||
    EMAIL_TEMPLATES[0]
  );
}

/** Merge stored/partial design values over the template defaults. */
export function resolveDesign(
  templateId: string | null | undefined,
  design?: Partial<EmailTemplateDesign> | null
): EmailTemplateDesign {
  const meta = getTemplateMeta(templateId);
  return { ...DEFAULT_DESIGN, ...meta.defaults, ...(design || {}) };
}

/** Design values a template starts with before the user customises anything. */
export function templateStartingDesign(templateId: string): EmailTemplateDesign {
  return resolveDesign(templateId, null);
}

// ─── HTML helpers ───────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function looksLikeHtml(value: string): boolean {
  return /<(p|div|table|br|span|a|h[1-6])\b/i.test(value);
}

/**
 * Turn the AI's plain-text body into email-safe paragraphs.
 * Bare URLs are linkified; a URL matching the CTA link is dropped because the
 * template renders it as a button instead.
 */
export function bodyTextToHtml(
  text: string,
  design: EmailTemplateDesign,
  ctaUrl?: string
): string {
  if (!text) return '';
  if (looksLikeHtml(text)) return text;

  const cta = (ctaUrl || '').trim();
  const paraStyle = `margin:0 0 16px 0;font-family:${design.fontFamily};font-size:${design.fontSize}px;line-height:1.6;color:${design.textColor};`;

  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean);

  const html = blocks
    .map(block => {
      const lines = block
        .split('\n')
        .map(line => line.trim())
        // Drop a bare CTA URL line — the button covers it.
        .filter(line => !(design.showButton && cta && line === cta))
        .filter(Boolean);
      if (!lines.length) return '';
      const inner = lines
        .map(line =>
          escapeHtml(line).replace(
            /(https?:\/\/[^\s<]+)/g,
            (url) => `<a href="${attr(url)}" style="color:${design.accentColor};text-decoration:underline;">${escapeHtml(url)}</a>`
          )
        )
        .join('<br/>');
      return `<p style="${paraStyle}">${inner}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  return html;
}

function buttonHtml(design: EmailTemplateDesign, ctaUrl: string, align: 'left' | 'center' = 'left'): string {
  if (!design.showButton || !ctaUrl.trim() || !design.buttonLabel.trim()) return '';
  const radius = Math.max(0, Math.min(999, design.buttonRadius));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px ${align === 'center' ? 'auto' : '0'} 24px ${align === 'center' ? 'auto' : '0'};">
  <tr>
    <td align="center" bgcolor="${attr(design.buttonColor)}" style="border-radius:${radius}px;">
      <a href="${attr(ctaUrl)}" style="display:inline-block;padding:14px 30px;font-family:${design.fontFamily};font-size:${design.fontSize}px;font-weight:bold;color:${attr(design.buttonTextColor)};text-decoration:none;border-radius:${radius}px;">${escapeHtml(design.buttonLabel)}</a>
    </td>
  </tr>
</table>`;
}

function brandHtml(design: EmailTemplateDesign, color: string, align: 'left' | 'center' = 'left'): string {
  if (!design.showLogo) return '';
  if (design.logoUrl.trim()) {
    return `<img src="${attr(design.logoUrl.trim())}" alt="${attr(design.brandName || 'Logo')}" width="140" style="display:block;max-width:180px;height:auto;border:0;margin:${align === 'center' ? '0 auto' : '0'};" />`;
  }
  if (!design.brandName.trim()) return '';
  return `<span style="font-family:${design.fontFamily};font-size:${design.fontSize + 4}px;font-weight:bold;color:${color};letter-spacing:0.3px;">${escapeHtml(design.brandName)}</span>`;
}

function headlineHtml(design: EmailTemplateDesign, align: 'left' | 'center' = 'left'): string {
  if (!design.showHeadline || !design.headline.trim()) return '';
  return `<h1 style="margin:0 0 16px 0;text-align:${align};font-family:${design.fontFamily};font-size:${design.fontSize + 8}px;line-height:1.3;color:${design.headingColor};font-weight:bold;">${escapeHtml(design.headline)}</h1>`;
}

function footerHtml(design: EmailTemplateDesign, mutedColor: string): string {
  if (!design.showFooter || !design.footerText.trim()) return '';
  return `<p style="margin:0;font-family:${design.fontFamily};font-size:12px;line-height:1.6;color:${mutedColor};">${escapeHtml(design.footerText)}</p>`;
}

function document_(design: EmailTemplateDesign, inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:${attr(design.backgroundColor)};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${attr(design.backgroundColor)};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="${design.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${design.contentWidth}px;">
${inner}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Per-template renderers ─────────────────────────────────────────────────

type RenderArgs = { design: EmailTemplateDesign; bodyHtml: string; ctaUrl: string };

const RENDERERS: Record<string, (args: RenderArgs) => string> = {
  'plain-personal': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="padding:8px 4px;background-color:${attr(design.contentBackground)};">
            ${headlineHtml(design)}
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
            ${design.showFooter ? `<div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:8px;">${footerHtml(design, '#9ca3af')}</div>` : ''}
          </td>
        </tr>`),

  'clean-card': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="height:6px;background-color:${attr(design.accentColor)};border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:32px;border-radius:0 0 12px 12px;">
            ${design.showLogo ? `<div style="margin-bottom:20px;">${brandHtml(design, design.headingColor)}</div>` : ''}
            ${headlineHtml(design)}
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
          </td>
        </tr>
        ${design.showFooter ? `<tr><td style="padding:18px 32px;text-align:center;">${footerHtml(design, '#9ca3af')}</td></tr>` : ''}`),

  'accent-rule': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:8px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="4" style="background-color:${attr(design.accentColor)};font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:8px 0 8px 24px;">
                  ${design.showLogo ? `<div style="margin-bottom:18px;">${brandHtml(design, design.accentColor)}</div>` : ''}
                  ${headlineHtml(design)}
                  ${bodyHtml}
                  ${buttonHtml(design, ctaUrl)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${design.showFooter ? `<tr><td style="padding:18px 0 0 28px;">${footerHtml(design, '#9ca3af')}</td></tr>` : ''}`),

  'bold-header': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="background-color:${attr(design.accentColor)};padding:24px 32px;border-radius:12px 12px 0 0;">
            ${brandHtml(design, '#ffffff') || `<span style="font-family:${design.fontFamily};font-size:${design.fontSize + 2}px;color:#ffffff;font-weight:bold;">&nbsp;</span>`}
          </td>
        </tr>
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:32px;border-radius:0 0 12px 12px;">
            ${headlineHtml(design)}
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
          </td>
        </tr>
        ${design.showFooter ? `<tr><td style="padding:18px 32px;text-align:center;">${footerHtml(design, '#9ca3af')}</td></tr>` : ''}`),

  corporate: ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:28px 36px 0 36px;border-top:4px solid ${attr(design.accentColor)};border-radius:4px 4px 0 0;">
            ${design.showLogo ? `<div style="padding-bottom:20px;border-bottom:1px solid #e5e7eb;margin-bottom:24px;">${brandHtml(design, design.headingColor)}</div>` : ''}
            ${headlineHtml(design)}
          </td>
        </tr>
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:0 36px 32px 36px;border-radius:0 0 4px 4px;">
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
          </td>
        </tr>
        ${design.showFooter ? `<tr><td style="padding:20px 36px;border-top:1px solid #e5e7eb;">${footerHtml(design, '#6b7280')}</td></tr>` : ''}`),

  newsletter: ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td align="center" style="background-color:${attr(design.contentBackground)};padding:28px 32px 0 32px;border-radius:12px 12px 0 0;">
            ${brandHtml(design, design.headingColor, 'center')}
          </td>
        </tr>
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:20px 32px 0 32px;">
            <div style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;margin-bottom:24px;">&nbsp;</div>
            ${headlineHtml(design)}
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
          </td>
        </tr>
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:0 32px 28px 32px;border-radius:0 0 12px 12px;">
            <div style="height:1px;background-color:#e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>
        ${design.showFooter ? `<tr><td align="center" style="padding:18px 32px;">${footerHtml(design, '#9ca3af')}</td></tr>` : ''}`),

  'gradient-cta': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td align="center" style="background-color:${attr(design.accentColor)};background-image:linear-gradient(135deg, ${attr(design.accentColor)} 0%, ${attr(design.buttonColor)} 100%);padding:36px 32px;border-radius:16px 16px 0 0;">
            ${design.showLogo ? `<div style="margin-bottom:12px;">${brandHtml(design, '#ffffff', 'center')}</div>` : ''}
            ${design.showHeadline && design.headline.trim()
              ? `<h1 style="margin:0;font-family:${design.fontFamily};font-size:${design.fontSize + 10}px;line-height:1.3;color:#ffffff;font-weight:bold;">${escapeHtml(design.headline)}</h1>`
              : ''}
          </td>
        </tr>
        <tr>
          <td align="center" style="background-color:${attr(design.contentBackground)};padding:32px;border-radius:0 0 16px 16px;">
            <div style="text-align:left;">${bodyHtml}</div>
            ${buttonHtml(design, ctaUrl, 'center')}
          </td>
        </tr>
        ${design.showFooter ? `<tr><td align="center" style="padding:18px 32px;">${footerHtml(design, '#9ca3af')}</td></tr>` : ''}`),

  'dark-modern': ({ design, bodyHtml, ctaUrl }) => document_(design, `
        <tr>
          <td style="background-color:${attr(design.contentBackground)};padding:32px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);">
            ${design.showLogo ? `<div style="margin-bottom:20px;">${brandHtml(design, design.accentColor)}</div>` : ''}
            ${headlineHtml(design)}
            ${bodyHtml}
            ${buttonHtml(design, ctaUrl)}
          </td>
        </tr>
        ${design.showFooter ? `<tr><td style="padding:18px 32px;text-align:center;">${footerHtml(design, '#6b7280')}</td></tr>` : ''}`),
};

/** Render a lead's email copy inside the campaign's selected template. */
export function renderEmailTemplate(
  templateId: string | null | undefined,
  design: Partial<EmailTemplateDesign> | null | undefined,
  opts: { body: string; ctaUrl?: string }
): string {
  const meta = getTemplateMeta(templateId);
  const resolved = resolveDesign(meta.id, design);
  const ctaUrl = (opts.ctaUrl || '').trim();
  const bodyHtml = bodyTextToHtml(opts.body || '', resolved, ctaUrl);
  const render = RENDERERS[meta.id] || RENDERERS[DEFAULT_TEMPLATE_ID];
  return render({ design: resolved, bodyHtml, ctaUrl });
}

/** Sample copy used for the live preview inside the picker modal. */
export const PREVIEW_BODY = `Hi Sarah,

I noticed Acme Analytics is hiring three backend engineers this quarter — usually a sign the roadmap is moving faster than the team can staff it.

We help teams like yours shortlist pre-vetted engineers in under two weeks, so you're interviewing instead of sourcing.

Worth a quick 15 minutes next week to see if it's a fit?

Best,
Alex`;
