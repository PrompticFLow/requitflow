import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id, userId: user.id },
      include: {
        campaignLeads: {
          include: {
            lead: {
              select: { id: true, businessName: true, email: true, status: true }
            }
          }
        },
        _count: {
          select: {
            leads: true,
            emailSequences: true,
            campaignLeads: true,
            replies: true,
            bookedCalls: true
          }
        }
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const [totalDrafts, pendingReview, approvedEmail1] = await Promise.all([
      prisma.emailSequence.count({ where: { campaignId: id } }),
      prisma.emailSequence.count({ where: { campaignId: id, approvalStatus: 'Pending' } }),
      prisma.emailSequence.count({ where: { campaignId: id, sequenceStep: 1, approvalStatus: 'Approved' } }),
    ]);

    return NextResponse.json({ campaign: { ...campaign, totalDrafts, pendingReview, approvedEmail1 } });
  } catch (error: any) {
    console.error('Fetch campaign error:', error);
    return NextResponse.json({ error: 'Something went wrong while loading this campaign. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await req.json();
    const { id } = await params;

    const updateData: any = {};
    const editableFields = [
      'name', 'campaignType', 'targetAudience', 'targetIndustry', 'targetCompanyType',
      'targetRoles', 'targetMarket', 'industry', 'offer', 'location', 'followUpStyle',
      'goal', 'tone', 'language', 'ctaType', 'ctaText', 'ctaLink', 'bookingLink',
      'bookingMethod', 'bookingLinkStrategy',
      'senderName', 'agencyName', 'emailSignature', 'status', 'sendingMode',
      'problemSolved', 'mainBenefit', 'uniqueMechanism', 'proofCaseStudy', 
      'painPoints', 'desiredOutcome', 'objections', 'avoidSaying',
      'unsubscribeLine', 'senderEmail',
      'dailyLimit', 'followUpCount', 'emailSequenceCount',
      'timingMode', 'timezoneMode', 'allowedSendingDays', 'sendingWindowStart',
      'sendingWindowEnd', 'weekendsEnabled', 'skipHolidays', 'autoApproveEmails',
      'autoSendApprovedEmails', 'bookingAutomationMode', 'meetingType',
      'meetingDuration', 'minimumBookingNotice', 'maximumBookingHorizon',
      'autoCreateCalendarEvent', 'autoSendBookingConfirmation',
      'knowledgeBaseMode', 'selectedKnowledgeBaseFileIds',
      'personalizationLevel', 'personalizationStyle', 'mentionCompanyName',
      'companyFallback', 'useKnowledgeBase', 'emailLength', 'spamSafety', 'ctaStyle',
      'autoReplyEnabled', 'autoReplyMode'
    ];

    for (const field of editableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (updateData.emailSequenceCount !== undefined) {
      updateData.emailSequenceCount = parseInt(String(updateData.emailSequenceCount)) || 4;
    }

    // Block status=Active from going through PATCH — use /start endpoint instead
    if (updateData.status === 'Active') {
      return NextResponse.json({
        error: 'Use the /start endpoint to start a campaign.',
      }, { status: 400 });
    }

    const campaign = await prisma.campaign.update({
      where: { id, userId: user.id },
      data: updateData
    });

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('Update campaign error:', error);
    return NextResponse.json({ error: 'Something went wrong while saving your campaign. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    const campaign = await prisma.campaign.findUnique({
      where: { id, userId: user.id },
      include: {
        _count: {
          select: { emailSequences: { where: { status: 'Sent' } } }
        }
      }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    if (campaign._count.emailSequences > 0 && !force) {
      // Soft delete / archive if emails were sent
      await prisma.campaign.update({
        where: { id },
        data: { status: 'Archived' }
      });
      return NextResponse.json({ success: true, archived: true });
    } else {
      await prisma.campaign.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: true });
    }

  } catch (error: any) {
    console.error('Delete campaign error:', error);
    return NextResponse.json({ error: 'Something went wrong while deleting this campaign. Please try again.' }, { status: 500 });
  }
}
