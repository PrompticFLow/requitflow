import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encrypt, decrypt } from '@/lib/encryption';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id }
  });

  if (!settings) return NextResponse.json({ settings: {} });

  // Only return masked or safe versions of secrets
  return NextResponse.json({
    settings: {
      ...settings,
      apifyTokenEncrypted: settings.apifyTokenEncrypted ? '********' : null,
      bayOfAssetsKeyEncrypted: settings.bayOfAssetsKeyEncrypted ? '********' : null,
      twilioSidEncrypted: settings.twilioSidEncrypted ? '********' : null,
      twilioAuthTokenEncrypted: settings.twilioAuthTokenEncrypted ? '********' : null,
      smtpPassEncrypted: settings.smtpPassEncrypted ? '********' : null,
    }
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await req.json();

  // Encrypt secrets if they are provided and not masked
  const updateData: any = { ...data };
  
  if (data.apifyTokenEncrypted && data.apifyTokenEncrypted !== '********') {
    updateData.apifyTokenEncrypted = encrypt(data.apifyTokenEncrypted);
  } else {
    delete updateData.apifyTokenEncrypted;
  }

  if (data.bayOfAssetsKeyEncrypted && data.bayOfAssetsKeyEncrypted !== '********') {
    updateData.bayOfAssetsKeyEncrypted = encrypt(data.bayOfAssetsKeyEncrypted);
  } else {
    delete updateData.bayOfAssetsKeyEncrypted;
  }
  
  // Similar for others
  if (data.twilioSidEncrypted && data.twilioSidEncrypted !== '********') updateData.twilioSidEncrypted = encrypt(data.twilioSidEncrypted); else delete updateData.twilioSidEncrypted;
  if (data.twilioAuthTokenEncrypted && data.twilioAuthTokenEncrypted !== '********') updateData.twilioAuthTokenEncrypted = encrypt(data.twilioAuthTokenEncrypted); else delete updateData.twilioAuthTokenEncrypted;
  if (data.smtpPassEncrypted && data.smtpPassEncrypted !== '********') updateData.smtpPassEncrypted = encrypt(data.smtpPassEncrypted); else delete updateData.smtpPassEncrypted;

  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: updateData,
    create: { userId: user.id, ...updateData }
  });

  return NextResponse.json({ success: true });
}
