/** Keep only the prospect's new text — ignore quoted originals / unsubscribe footers. */
export function extractLatestReplyText(body: string): string {
  let text = String(body || '').replace(/\r\n/g, '\n');

  // Gmail / Apple Mail: "On <date>, <name> wrote:"
  text = text.split(/\nOn .{10,120}wrote:\s*\n/i)[0];
  // Outlook-style separators
  text = text.split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0];
  text = text.split(/\nFrom:\s+.+\nSent:\s+/i)[0];

  // Drop quoted lines
  const lines = text.split('\n').filter((line) => !/^\s*>/.test(line));
  const cleaned = lines.join('\n').trim();
  return cleaned || String(body || '').trim();
}
