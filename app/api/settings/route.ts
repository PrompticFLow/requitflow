import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { getByokConfiguredFlags, isByokEnabled } from '@/lib/byok';
import { ensureResendReplyTracking, validateResendApiKey } from '@/lib/resend';

const MASK = '********';

function encryptIfPlain(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value === MASK) return undefined;
  return encrypt(value);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id }
  });

  const configured = await getByokConfiguredFlags(user.id);
  const isByok = isByokEnabled();

  if (!settings) {
    return NextResponse.json({
      isByok,
      configured,
      settings: {},
    });
  }

  return NextResponse.json({
    isByok,
    configured,
    settings: {
      ...settings,
      apifyTokenEncrypted: settings.apifyTokenEncrypted ? MASK : null,
      bayOfAssetsKeyEncrypted: settings.bayOfAssetsKeyEncrypted ? MASK : null,
      openRouterKeyEncrypted: settings.openRouterKeyEncrypted ? MASK : null,
      neverBounceKeyEncrypted: settings.neverBounceKeyEncrypted ? MASK : null,
      pdlKeyEncrypted: settings.pdlKeyEncrypted ? MASK : null,
      resendKeyEncrypted: settings.resendKeyEncrypted ? MASK : null,
      resendWebhookSecretEncrypted: settings.resendWebhookSecretEncrypted ? MASK : null,
      twilioSidEncrypted: settings.twilioSidEncrypted ? MASK : null,
      twilioAuthTokenEncrypted: settings.twilioAuthTokenEncrypted ? MASK : null,
      smtpPassEncrypted: settings.smtpPassEncrypted ? MASK : null,
    }
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await req.json();
  const updateData: Record<string, unknown> = { ...data };

  // Never persist masked placeholders; only encrypt fresh plaintext secrets.
  const secretFields = [
    'apifyTokenEncrypted',
    'bayOfAssetsKeyEncrypted',
    'openRouterKeyEncrypted',
    'neverBounceKeyEncrypted',
    'pdlKeyEncrypted',
    'resendKeyEncrypted',
    'twilioSidEncrypted',
    'twilioAuthTokenEncrypted',
    'smtpPassEncrypted',
  ] as const;

  for (const field of secretFields) {
    const encrypted = encryptIfPlain(data[field]);
    if (encrypted) updateData[field] = encrypted;
    else delete updateData[field];
  }

  const resendKeyChanged = updateData.resendKeyEncrypted !== undefined;
  if (resendKeyChanged) {
    const key = String(data.resendKeyEncrypted).trim();
    if (!key.startsWith('re_')) {
      return NextResponse.json(
        { error: 'That does not look like a Resend API key (it should start with "re_").' },
        { status: 400 }
      );
    }
    const validation = await validateResendApiKey(key);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    // A new key may belong to a different Resend account — drop the webhook
    // we remembered so it is re-created (and re-verified) below.
    updateData.resendWebhookId = null;
    updateData.resendWebhookSecretEncrypted = null;
  }

  // Strip response-only fields if clients echo them back
  delete updateData.id;
  delete updateData.userId;
  delete updateData.createdAt;
  delete updateData.updatedAt;
  delete updateData.isByok;
  delete updateData.configured;

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: updateData,
    create: { userId: user.id, ...updateData }
  });

  // Saving a Resend key auto-creates the reply/bounce webhook in that Resend
  // account. Best-effort — never blocks saving the key.
  let replyTracking: string | undefined;
  if (resendKeyChanged) {
    try {
      replyTracking = await ensureResendReplyTracking(user.id);
    } catch (err: any) {
      console.error('Resend reply tracking setup failed:', err?.message);
      replyTracking = 'failed';
    }
  }

  return NextResponse.json({ success: true, ...(replyTracking ? { replyTracking } : {}) });
}
