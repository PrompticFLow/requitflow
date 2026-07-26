import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { syncCalendlyBookingsForUser } from '@/lib/calendly';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaignId');
    // Opt-in sync only — blocking Calendly pull made this endpoint ~10s and UI looked empty
    const shouldSync = url.searchParams.get('sync') === '1';

    let syncResult: { synced: number; matched: number } | null = null;
    if (shouldSync) {
      try {
        const integration = await prisma.calendlyIntegration.findUnique({
          where: { userId: user.id },
        });
        if (integration?.connected) {
          syncResult = await syncCalendlyBookingsForUser(user.id);
        }
      } catch (err) {
        console.warn('Calendly sync failed (returning local rows):', err);
      }
    }

    const where = campaignId
      ? {
          userId: user.id,
          OR: [
            { campaignId },
            { lead: { campaignId } },
            { lead: { campaignLeads: { some: { campaignId } } } },
          ],
        }
      : { userId: user.id };

    const bookedCalls = await prisma.bookedCall.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            fullName: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      calls: bookedCalls,
      sync: syncResult,
    });
  } catch (error: any) {
    console.error('Fetch booked calls error:', error);
    return NextResponse.json({ error: 'Fetch failed.' }, { status: 500 });
  }
}
