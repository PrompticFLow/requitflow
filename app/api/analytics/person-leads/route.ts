import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const rawLeads = await prisma.rawLead.findMany({
      where: { userId: user.id },
      select: { validationStatus: true }
    });

    const totalLeads = rawLeads.length;
    let validCount = 0;
    let needsReviewCount = 0;
    let invalidCount = 0;

    rawLeads.forEach(lead => {
      if (lead.validationStatus === 'valid' || lead.validationStatus === 'Valid') validCount++;
      else if (lead.validationStatus === 'needs_review' || lead.validationStatus === 'Needs Review') needsReviewCount++;
      else if (lead.validationStatus === 'invalid' || lead.validationStatus === 'Invalid') invalidCount++;
    });

    return NextResponse.json({
      success: true,
      totalLeads,
      validCount,
      needsReviewCount,
      invalidCount,
    });
  } catch (err: any) {
    console.error("Person Leads Analytics API Error:", err);
    return NextResponse.json({ success: false, error: "Failed to load analytics" }, { status: 500 });
  }
}
