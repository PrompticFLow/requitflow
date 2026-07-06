import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  const sendLogId = url.searchParams.get('sendLogId');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing destination URL' }, { status: 400 });
  }

  try {
    if (sendLogId) {
      const log = await prisma.emailSendLog.findUnique({
        where: { id: sendLogId },
        include: { lead: true }
      });

      if (log && !log.clickedAt) {
        // Mark as clicked
        await prisma.emailSendLog.update({
          where: { id: sendLogId },
          data: { clickedAt: new Date() }
        });

        // Update Lead priority feedback loop
        if (log.leadId) {
          await prisma.lead.update({
            where: { id: log.leadId },
            data: {
              leadScore: { increment: 15 }, // Clicks get higher priority bump than opens
              leadTier: 'Interested'
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Click tracking error:', error);
    // Even if tracking fails, always redirect the user to their destination
  }

  // Redirect to the actual link destination
  return NextResponse.redirect(targetUrl);
}
