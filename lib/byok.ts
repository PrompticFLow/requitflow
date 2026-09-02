import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export type ByokService =
  | 'openrouter'
  | 'oppora'
  | 'apify'
  | 'bayofassets'
  | 'resend'
  | 'twilio';

const SERVICE_LABELS: Record<ByokService, string> = {
  openrouter: 'OpenRouter',
  oppora: 'Oppora',
  apify: 'Apify',
  bayofassets: 'Bay of Assets',
  resend: 'Resend',
  twilio: 'Twilio',
};

const ENV_KEYS: Record<Exclude<ByokService, 'twilio'>, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  oppora: 'OPPORA_API_KEY',
  apify: 'APIFY_API_TOKEN',
  bayofassets: 'BAYOFASSETS_API_KEY',
  resend: 'RESEND_API_KEY',
};

export class ByokKeyMissingError extends Error {
  service: ByokService;
  constructor(service: ByokService, message: string) {
    super(message);
    this.service = service;
    this.name = 'ByokKeyMissingError';
  }
}

export function isByokEnabled(): boolean {
  const raw = (process.env.IS_BYOK || '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

function missingMessage(service: ByokService): string {
  const label = SERVICE_LABELS[service];
  if (isByokEnabled()) {
    return `Add your ${label} API key in Settings.`;
  }
  if (service === 'twilio') {
    return 'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.';
  }
  return `${ENV_KEYS[service]} is not configured.`;
}

function safeDecrypt(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    const value = decrypt(encrypted).trim();
    return value || null;
  } catch {
    return null;
  }
}

async function loadSettings(userId: string) {
  return prisma.userSettings.findUnique({ where: { userId } });
}

/**
 * Strict key resolution:
 * - IS_BYOK=true  → only the user's encrypted Settings key
 * - IS_BYOK=false → only process.env
 */
export async function resolveUserApiKey(
  userId: string,
  service: Exclude<ByokService, 'twilio'>
): Promise<string> {
  if (isByokEnabled()) {
    if (!userId) throw new ByokKeyMissingError(service, missingMessage(service));
    const settings = await loadSettings(userId);
    let encrypted: string | null | undefined;
    switch (service) {
      case 'openrouter':
        encrypted = settings?.openRouterKeyEncrypted;
        break;
      case 'oppora':
        encrypted = settings?.opporaKeyEncrypted;
        break;
      case 'apify':
        encrypted = settings?.apifyTokenEncrypted;
        break;
      case 'bayofassets':
        encrypted = settings?.bayOfAssetsKeyEncrypted;
        break;
      case 'resend':
        encrypted = settings?.resendKeyEncrypted;
        break;
    }
    const key = safeDecrypt(encrypted);
    if (!key) throw new ByokKeyMissingError(service, missingMessage(service));
    return key;
  }

  const envKey = process.env[ENV_KEYS[service]]?.trim();
  if (!envKey) throw new ByokKeyMissingError(service, missingMessage(service));
  return envKey;
}

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  phone: string;
};

export async function resolveTwilioCredentials(userId: string): Promise<TwilioCredentials> {
  if (isByokEnabled()) {
    if (!userId) throw new ByokKeyMissingError('twilio', missingMessage('twilio'));
    const settings = await loadSettings(userId);
    const accountSid = safeDecrypt(settings?.twilioSidEncrypted);
    const authToken = safeDecrypt(settings?.twilioAuthTokenEncrypted);
    const phone = (settings?.twilioPhone || '').trim();
    if (!accountSid || !authToken || !phone) {
      throw new ByokKeyMissingError('twilio', missingMessage('twilio'));
    }
    return { accountSid, authToken, phone };
  }

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const phone = (process.env.TWILIO_PHONE_NUMBER || '').trim();
  if (!accountSid || !authToken || !phone) {
    throw new ByokKeyMissingError('twilio', missingMessage('twilio'));
  }
  return { accountSid, authToken, phone };
}

/** Whether the user (BYOK) or server (non-BYOK) has a key configured — never returns the secret. */
export async function getByokConfiguredFlags(userId: string): Promise<Record<ByokService, boolean>> {
  if (!isByokEnabled()) {
    return {
      openrouter: !!process.env.OPENROUTER_API_KEY?.trim(),
      oppora: !!process.env.OPPORA_API_KEY?.trim(),
      apify: !!process.env.APIFY_API_TOKEN?.trim(),
      bayofassets: !!process.env.BAYOFASSETS_API_KEY?.trim(),
      resend: !!process.env.RESEND_API_KEY?.trim(),
      twilio: !!(
        process.env.TWILIO_ACCOUNT_SID?.trim() &&
        process.env.TWILIO_AUTH_TOKEN?.trim() &&
        process.env.TWILIO_PHONE_NUMBER?.trim()
      ),
    };
  }

  const settings = await loadSettings(userId);
  return {
    openrouter: !!safeDecrypt(settings?.openRouterKeyEncrypted),
    oppora: !!safeDecrypt(settings?.opporaKeyEncrypted),
    apify: !!safeDecrypt(settings?.apifyTokenEncrypted),
    bayofassets: !!safeDecrypt(settings?.bayOfAssetsKeyEncrypted),
    resend: !!safeDecrypt(settings?.resendKeyEncrypted),
    twilio: !!(
      safeDecrypt(settings?.twilioSidEncrypted) &&
      safeDecrypt(settings?.twilioAuthTokenEncrypted) &&
      (settings?.twilioPhone || '').trim()
    ),
  };
}
