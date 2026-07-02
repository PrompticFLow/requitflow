/**
 * Helper to validate LinkedIn profile URLs.
 */
export function isValidLinkedInProfileUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const trimmedUrl = url.trim().toLowerCase();
  
  // Must be a LinkedIn URL
  if (!trimmedUrl.includes('linkedin.com/in/')) return false;
  
  // Reject company, job, post, or search pages just in case
  const invalidPaths = ['/company/', '/jobs/', '/posts/', '/search/'];
  if (invalidPaths.some(path => trimmedUrl.includes(path))) return false;
  
  return true;
}

/**
 * Helper to normalize LinkedIn profile URLs.
 */
export function normalizeLinkedInProfileUrl(url: string): string {
  let normalized = url.trim();
  
  // Ensure protocol exists
  if (!normalized.startsWith('http')) {
    normalized = `https://${normalized}`;
  }
  
  return normalized;
}

/**
 * Parse text area input into a unique array of valid LinkedIn profile URLs.
 */
export function parseLinkedInUrls(text: string): string[] {
  if (!text) return [];
  
  const lines = text.split('\n');
  const validUrls = new Set<string>();
  
  for (const line of lines) {
    const clean = line.trim();
    if (isValidLinkedInProfileUrl(clean)) {
      validUrls.add(normalizeLinkedInProfileUrl(clean));
    }
  }
  
  return Array.from(validUrls);
}
