import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { ensureResendReplyTracking, getResendReplyTrackingStatus } from '@/lib/resend';
import { getByokConfiguredFlags, isByokEnabled } from '@/lib/byok';

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

    // The Resend API key is account-level (env or Settings) — report only
    // whether it is configured, never the key itself.
    const [{ resend: resendKeyConfigured }, replyTrackingActive] = await Promise.all([
      getByokConfiguredFlags(user.id),
      getResendReplyTrackingStatus(user.id),
    ]);

    return NextResponse.json({
      campaign: {
        ...campaign,
        isByok: isByokEnabled(),
        resendKeyConfigured,
        resendReplyTracking: replyTrackingActive,
        resendConfigured: resendKeyConfigured && !!campaign.resendFromEmail,
        totalDrafts,
        pendingReview,
        approvedEmail1
      }
    });
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
      'autoReplyEnabled', 'autoReplyMode', 'resendFromEmail',
      'emailBodyMode', 'htmlEmailTemplates'
    ];

    for (const field of editableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (updateData.emailBodyMode !== undefined) {
      const mode = String(updateData.emailBodyMode).toLowerCase();
      if (mode !== 'ai' && mode !== 'html') {
        return NextResponse.json({ error: 'emailBodyMode must be "ai" or "html".' }, { status: 400 });
      }
      updateData.emailBodyMode = mode;
    }

    if (updateData.htmlEmailTemplates !== undefined) {
      if (updateData.htmlEmailTemplates === null) {
        updateData.htmlEmailTemplates = null;
      } else if (typeof updateData.htmlEmailTemplates !== 'object' || Array.isArray(updateData.htmlEmailTemplates)) {
        return NextResponse.json({ error: 'htmlEmailTemplates must be an object keyed by sequence step.' }, { status: 400 });
      } else {
        const cleaned: Record<string, { subject: string; html: string }> = {};
        for (const [key, value] of Object.entries(updateData.htmlEmailTemplates as Record<string, any>)) {
          if (!/^\d+$/.test(key)) continue;
          if (!value || typeof value !== 'object') continue;
          const subject = typeof value.subject === 'string' ? value.subject : '';
          const html = typeof value.html === 'string' ? value.html : '';
          if (Buffer.byteLength(html, 'utf8') > 500_000) {
            return NextResponse.json({ error: `Email ${key} HTML exceeds the 500KB size limit.` }, { status: 400 });
          }
          cleaned[key] = { subject, html };
        }
        updateData.htmlEmailTemplates = cleaned;
      }
    }

    // A campaign only owns its sender address — the Resend API key is
    // account-level (RESEND_API_KEY, or Settings → API Keys when IS_BYOK=true).
    if (updateData.resendFromEmail) {
      const email = String(updateData.resendFromEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Please enter a valid sender email address.' }, { status: 400 });
      }
      updateData.resendFromEmail = email;
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

    // Saving a sender address is the moment reply capture becomes useful:
    // make sure the webhook exists in the Resend account. Best-effort.
    let replyTracking: string | null = null;
    if (updateData.resendFromEmail) {
      try {
        replyTracking = await ensureResendReplyTracking(user.id);
      } catch (err: any) {
        console.error('Resend reply tracking setup failed:', err?.message);
        replyTracking = 'failed';
      }
    }

    const { resend: resendKeyConfigured } = await getByokConfiguredFlags(user.id);
    return NextResponse.json({
      campaign: {
        ...campaign,
        isByok: isByokEnabled(),
        resendKeyConfigured,
        resendConfigured: resendKeyConfigured && !!campaign.resendFromEmail,
      },
      ...(replyTracking ? { replyTracking } : {})
    });
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
