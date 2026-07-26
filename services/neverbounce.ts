const API_BASE = 'https://api.neverbounce.com/v4';

// NeverBounce v4 single/check returns `result` as a string, not a numeric code.
const RESULT_CODES: Record<string, string> = {
  valid: 'Valid',
  invalid: 'Invalid',
  disposable: 'Disposable',
  catchall: 'Catchall',
  unknown: 'Unknown',
};

export type VerificationResult = {
  email: string;
  status: string;          // Valid | Invalid | Disposable | Catchall | Unknown | Error
  code: string | null;
  error?: string;
};

/**
 * Verify a single email. NeverBounce returns HTTP 200 even for failures, so the
 * `status` field in the body is what decides success.
 */
export async function verifyEmail(email: string, apiKey: string): Promise<VerificationResult> {
  try {
    const res = await fetch(`${API_BASE}/single/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, email }),
    });

    const data = await res.json();

    if (data.status !== 'success') {
      return {
        email,
        status: 'Error',
        code: null,
        error: data.message || data.status || 'Verification failed',
      };
    }

    return { email, status: RESULT_CODES[data.result] ?? 'Unknown', code: data.result };
  } catch (err: any) {
    return { email, status: 'Error', code: null, error: err.message || 'Request failed' };
  }
}

/** Verify many emails with a bounded number of in-flight requests. */
export async function verifyEmails(
  emails: string[],
  apiKey: string,
  concurrency = 5
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = new Array(emails.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < emails.length) {
      const i = cursor++;
      results[i] = await verifyEmail(emails[i], apiKey);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, worker));
  return results;
}

/** Remaining credits, so the UI can warn before burning a batch. */
export async function getAccountInfo(apiKey: string) {
  const res = await fetch(`${API_BASE}/account/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: apiKey }),
  });
  return res.json();
}
