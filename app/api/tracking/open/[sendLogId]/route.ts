import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: Request, { params }: { params: Promise<{ sendLogId: string }> }) {
  const { sendLogId } = await params;

  try {
    // 1. Fetch the log to verify it exists and get associated lead
    const log = await prisma.emailSendLog.findUnique({
      where: { id: sendLogId },
      include: { lead: true }
    });

    if (log && !log.openedAt) {
      // 2. Mark as opened
      await prisma.emailSendLog.update({
        where: { id: sendLogId },
        data: { openedAt: new Date() }
      });

      // 3. Update Lead priority feedback loop
      if (log.leadId) {
        const updateData: any = {
          leadScore: { increment: 10 } // Increase priority score
        };
        
        // Upgrade cold leads to warm since they engaged
        if (log.lead.leadTier === 'Cold') {
          updateData.leadTier = 'Warm';
        }

        await prisma.lead.update({
          where: { id: log.leadId },
          data: updateData
        });
      }
    }
  } catch (error) {
    console.error('Tracking pixel error:', error);
  }

  // 4. Always return the invisible 1x1 GIF so the email client doesn't break
  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}
