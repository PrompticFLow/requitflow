/** Build a single "Re: …" subject without stacking Re:/RE:/Fwd: prefixes. */
export function buildReplySubject(
  original?: string | null,
  fallback = 'Quick question'
): string {
  let cleaned = (original || fallback).trim();
  while (/^(re|fw|fwd):\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^(re|fw|fwd):\s*/i, '').trim();
  }
  return `Re: ${cleaned || fallback}`;
}
