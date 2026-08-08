"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2, Palette, Type, MousePointerClick, Building2, Eye } from "lucide-react";
import {
  COLOR_PRESETS,
  EMAIL_TEMPLATES,
  FONT_OPTIONS,
  PREVIEW_BODY,
  renderEmailTemplate,
  resolveDesign,
  templateStartingDesign,
  type EmailTemplateDesign,
  type EmailTemplateMeta,
} from "@/lib/email/email-templates";

/** Fields that follow the user when they try a different template. */
const CARRY_OVER: (keyof EmailTemplateDesign)[] = [
  "brandName",
  "logoUrl",
  "buttonLabel",
  "footerText",
  "headline",
  "fontFamily",
  "fontSize",
];

const CATEGORIES = ["All", ...Array.from(new Set(EMAIL_TEMPLATES.map(t => t.category)))];

type Props = {
  open: boolean;
  initialTemplateId: string | null;
  initialDesign: Partial<EmailTemplateDesign> | null;
  ctaUrl?: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (templateId: string, design: EmailTemplateDesign) => void | Promise<void>;
};

export default function EmailTemplatePicker({
  open,
  initialTemplateId,
  initialDesign,
  ctaUrl,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const [templateId, setTemplateId] = useState(initialTemplateId || EMAIL_TEMPLATES[0].id);
  const [design, setDesign] = useState<EmailTemplateDesign>(
    resolveDesign(initialTemplateId, initialDesign)
  );
  const [category, setCategory] = useState("All");

  // Re-seed whenever the modal is (re)opened so it always reflects saved state.
  useEffect(() => {
    if (!open) return;
    const id = initialTemplateId || EMAIL_TEMPLATES[0].id;
    setTemplateId(id);
    setDesign(resolveDesign(id, initialDesign));
    setCategory("All");
  }, [open, initialTemplateId, initialDesign]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const previewCta = (ctaUrl || "").trim() || "https://calendly.com/your-booking-link";

  const previewHtml = useMemo(
    () => renderEmailTemplate(templateId, design, { body: PREVIEW_BODY, ctaUrl: previewCta }),
    [templateId, design, previewCta]
  );

  if (!open) return null;

  const set = <K extends keyof EmailTemplateDesign>(key: K, value: EmailTemplateDesign[K]) =>
    setDesign(prev => ({ ...prev, [key]: value }));

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    setDesign(prev => {
      const next = templateStartingDesign(id);
      for (const key of CARRY_OVER) {
        (next as any)[key] = prev[key];
      }
      return next;
    });
  };

  const visibleTemplates =
    category === "All" ? EMAIL_TEMPLATES : EMAIL_TEMPLATES.filter(t => t.category === category);

  // Portal to body so the modal escapes the dashboard main stacking context (z-0)
  // and sits above the fixed header (z-10).
  const modal = (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-[1240px] h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <Palette size={17} className="text-purple-400" /> Choose an email template
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              One template is used for every email in the sequence. The AI still writes the copy for each lead —
              this controls how it looks.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[290px_1fr_310px]">
          {/* Gallery */}
          <div className="border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col min-h-0">
            <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-800/80 shrink-0">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    category === c
                      ? "bg-purple-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {visibleTemplates.map(t => (
                <TemplateCard
                  key={t.id}
                  meta={t}
                  selected={t.id === templateId}
                  onSelect={() => selectTemplate(t.id)}
                />
              ))}
            </div>
          </div>

          {/* Live preview */}
          <div className="min-h-0 flex flex-col bg-slate-900/40">
            <div className="px-4 py-2 border-b border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
              <Eye size={13} className="text-purple-400" />
              Live preview — sample copy, real leads get their own AI-written email
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <iframe
                title="Email template preview"
                srcDoc={previewHtml}
                className="w-full h-full rounded-lg bg-white border border-slate-800"
                sandbox=""
              />
            </div>
          </div>

          {/* Customization */}
          <div className="border-t lg:border-t-0 lg:border-l border-slate-800 overflow-y-auto p-4 space-y-5">
            <Section icon={<Palette size={13} />} title="Colours">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {COLOR_PRESETS.map(p => (
                  <button
                    key={p.name}
                    title={p.name}
                    onClick={() =>
                      setDesign(prev => ({
                        ...prev,
                        accentColor: p.accent,
                        buttonColor: p.button,
                        backgroundColor: templateId === "dark-modern" ? prev.backgroundColor : p.background,
                      }))
                    }
                    className="w-7 h-7 rounded-full border-2 border-slate-700 hover:border-white transition-colors"
                    style={{ backgroundColor: p.accent }}
                  />
                ))}
              </div>
              <ColorField label="Accent" value={design.accentColor} onChange={v => set("accentColor", v)} />
              <ColorField label="Page background" value={design.backgroundColor} onChange={v => set("backgroundColor", v)} />
              <ColorField label="Content background" value={design.contentBackground} onChange={v => set("contentBackground", v)} />
              <ColorField label="Body text" value={design.textColor} onChange={v => set("textColor", v)} />
              <ColorField label="Heading" value={design.headingColor} onChange={v => set("headingColor", v)} />
            </Section>

            <Section icon={<Type size={13} />} title="Typography & layout">
              <Field label="Font">
                <select
                  value={design.fontFamily}
                  onChange={e => set("fontFamily", e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:border-purple-500 outline-none"
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </Field>
              <RangeField label="Body size" value={design.fontSize} min={12} max={22} suffix="px" onChange={v => set("fontSize", v)} />
              <RangeField label="Email width" value={design.contentWidth} min={480} max={720} step={20} suffix="px" onChange={v => set("contentWidth", v)} />
            </Section>

            <Section icon={<Building2 size={13} />} title="Branding">
              <Toggle label="Show logo / brand name" checked={design.showLogo} onChange={v => set("showLogo", v)} />
              {design.showLogo && (
                <>
                  <Field label="Brand name">
                    <TextInput value={design.brandName} placeholder="Your company" onChange={v => set("brandName", v)} />
                  </Field>
                  <Field label="Logo image URL (optional)">
                    <TextInput
                      value={design.logoUrl}
                      placeholder="Paste a link, e.g. https://yoursite.com/logo.png"
                      onChange={v => set("logoUrl", v.trim())}
                    />
                  </Field>
                  <LogoPreview url={design.logoUrl} />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Paste a public image link (PNG, JPG or SVG). Leave it empty to show the brand name as text instead.
                  </p>
                </>
              )}
              <Toggle label="Show headline" checked={design.showHeadline} onChange={v => set("showHeadline", v)} />
              {design.showHeadline && (
                <Field label="Headline (merge tags allowed)">
                  <TextInput value={design.headline} placeholder="A quick idea for {{companyName}}" onChange={v => set("headline", v)} />
                </Field>
              )}
              <Toggle label="Show footer" checked={design.showFooter} onChange={v => set("showFooter", v)} />
              {design.showFooter && (
                <Field label="Footer text">
                  <TextArea value={design.footerText} onChange={v => set("footerText", v)} />
                </Field>
              )}
            </Section>

            <Section icon={<MousePointerClick size={13} />} title="Call-to-action button">
              <Toggle label="Show button" checked={design.showButton} onChange={v => set("showButton", v)} />
              {design.showButton && (
                <>
                  <Field label="Button label">
                    <TextInput value={design.buttonLabel} placeholder="Book a 15-min call" onChange={v => set("buttonLabel", v)} />
                  </Field>
                  <ColorField label="Button colour" value={design.buttonColor} onChange={v => set("buttonColor", v)} />
                  <ColorField label="Button text" value={design.buttonTextColor} onChange={v => set("buttonTextColor", v)} />
                  <RangeField label="Corner radius" value={design.buttonRadius} min={0} max={40} suffix="px" onChange={v => set("buttonRadius", v)} />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    The button links to your campaign booking link
                    {ctaUrl?.trim() ? <> — <span className="text-slate-400 break-all">{ctaUrl.trim()}</span></> : ". Add one in Overview so the button works."}
                  </p>
                </>
              )}
            </Section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-800 shrink-0">
          <p className="text-[11px] text-slate-500 hidden sm:block">
            Merge tags like <code className="text-purple-300">{"{{firstName}}"}</code> and{" "}
            <code className="text-purple-300">{"{{companyName}}"}</code> work in the headline and footer.
          </p>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(templateId, design)}
              disabled={saving}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Use this template
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

// ─── Gallery card ───────────────────────────────────────────────────────────

function TemplateCard({
  meta,
  selected,
  onSelect,
}: {
  meta: EmailTemplateMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const d = resolveDesign(meta.id, null);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-2.5 transition-colors ${
        selected
          ? "border-purple-500 bg-purple-500/10"
          : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
      }`}
    >
      <div className="flex gap-3">
        <Thumb id={meta.id} d={d} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate">{meta.name}</span>
            {selected && <Check size={13} className="text-purple-400 shrink-0" />}
          </div>
          <span className="text-[10px] uppercase tracking-wide text-purple-300/70">{meta.category}</span>
          <p className="text-[11px] text-slate-400 leading-snug mt-1 line-clamp-3">{meta.description}</p>
        </div>
      </div>
    </button>
  );
}

/** Tiny abstract preview of each layout, drawn from the template's own colours. */
function Thumb({ id, d }: { id: string; d: EmailTemplateDesign }) {
  const line = (w: string, key: number) => (
    <div key={key} style={{ width: w, height: 3, borderRadius: 2, background: d.textColor, opacity: 0.35 }} />
  );
  const btn = (
    <div style={{ width: 22, height: 6, borderRadius: d.buttonRadius > 20 ? 6 : 2, background: d.buttonColor }} />
  );

  return (
    <div
      className="w-16 h-[76px] rounded-md overflow-hidden shrink-0 border border-black/20"
      style={{ background: d.backgroundColor, padding: 5 }}
    >
      <div
        className="w-full h-full flex flex-col gap-1.5 overflow-hidden"
        style={{
          background: d.contentBackground,
          borderRadius: 3,
          padding: 4,
          borderLeft: id === "accent-rule" ? `3px solid ${d.accentColor}` : undefined,
          borderTop: id === "corporate" ? `3px solid ${d.accentColor}` : undefined,
        }}
      >
        {id === "clean-card" && <div style={{ height: 3, background: d.accentColor, borderRadius: 2, margin: "-4px -4px 0" }} />}
        {(id === "bold-header" || id === "gradient-cta") && (
          <div
            style={{
              height: 14,
              margin: "-4px -4px 0",
              background:
                id === "gradient-cta"
                  ? `linear-gradient(135deg, ${d.accentColor}, ${d.buttonColor})`
                  : d.accentColor,
            }}
          />
        )}
        {id === "newsletter" && (
          <>
            <div style={{ width: 20, height: 4, borderRadius: 2, background: d.headingColor, margin: "0 auto" }} />
            <div style={{ height: 1, background: d.textColor, opacity: 0.2 }} />
          </>
        )}
        {["bold-header", "gradient-cta", "dark-modern"].includes(id) && (
          <div style={{ width: 30, height: 5, borderRadius: 2, background: d.headingColor, opacity: 0.9 }} />
        )}
        {[1, 2, 3].map(i => line(i === 3 ? "60%" : "100%", i))}
        {d.showButton && btn}
        {d.showFooter && <div style={{ marginTop: "auto", width: "70%", height: 2, background: d.textColor, opacity: 0.2 }} />}
      </div>
    </div>
  );
}

// ─── Small form primitives ──────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-300 flex items-center gap-1.5 mb-2.5">
        <span className="text-purple-400">{icon}</span> {title}
      </h4>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

/** Confirms the pasted logo link actually loads before the campaign goes out. */
function LogoPreview({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  const trimmed = url.trim();

  useEffect(() => {
    setState("idle");
  }, [trimmed]);

  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    return <p className="text-[10px] text-yellow-500/90">Logo links must start with http:// or https://</p>;
  }

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmed}
        alt="Logo preview"
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className={`h-7 max-w-[110px] object-contain ${state === "error" ? "hidden" : ""}`}
      />
      <span className={`text-[10px] ${state === "error" ? "text-red-400" : "text-slate-400"}`}>
        {state === "error"
          ? "That image link could not be loaded."
          : state === "ok"
            ? "Logo loaded"
            : "Loading preview…"}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-400 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:border-purple-500 outline-none"
    />
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      rows={2}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white text-xs focus:border-purple-500 outline-none resize-none"
    />
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-[74px] bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-white text-[11px] font-mono focus:border-purple-500 outline-none"
        />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-slate-700 bg-slate-900 cursor-pointer p-0.5"
        />
      </div>
    </div>
  );
}

function RangeField({
  label, value, min, max, step = 1, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
        <span>{label}</span>
        <span className="text-slate-300 font-mono">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-2 group"
    >
      <span className="text-[11px] text-slate-400 group-hover:text-slate-200 text-left">{label}</span>
      <span
        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? "bg-purple-600" : "bg-slate-700"}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
