import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { validateResendApiKey, ensureResendWebhook } from '@/lib/resend';

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

    // Never expose the encrypted Resend API key — only whether one is set
    const { resendApiKeyEncrypted, resendWebhookSecretEncrypted, ...safeCampaign } = campaign as any;

    return NextResponse.json({
      campaign: {
        ...safeCampaign,
        resendConfigured: !!resendApiKeyEncrypted,
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
      'autoReplyEnabled', 'autoReplyMode', 'resendFromEmail'
    ];

    for (const field of editableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    // Resend API key: stored encrypted, one key per campaign.
    // Pass a plain key to set/replace it, or null to disconnect the sender.
    let webhookAutoSetup: 'created' | 'skipped-localhost' | 'failed' | null = null;
    if (data.resendApiKey !== undefined) {
      if (data.resendApiKey === null || data.resendApiKey === '') {
        updateData.resendApiKeyEncrypted = null;
        updateData.resendWebhookId = null;
        updateData.resendWebhookSecretEncrypted = null;
      } else {
        const apiKey = String(data.resendApiKey).trim();
        if (!apiKey.startsWith('re_')) {
          return NextResponse.json({ error: 'That does not look like a Resend API key (it should start with "re_").' }, { status: 400 });
        }
        const validation = await validateResendApiKey(apiKey);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 });
        }
        updateData.resendApiKeyEncrypted = encrypt(apiKey);

        // Auto-configure reply capture: create the inbound webhook in the
        // customer's Resend account so replies/bounces flow back to us with
        // zero manual setup. Best-effort — never blocks saving the key.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        if (!appUrl || /localhost|127\.0\.0\.1/.test(appUrl)) {
          webhookAutoSetup = 'skipped-localhost';
        } else {
          const webhook = await ensureResendWebhook(apiKey, `${appUrl.replace(/\/$/, '')}/api/webhooks/resend`);
          if (webhook) {
            updateData.resendWebhookId = webhook.webhookId;
            if (webhook.signingSecret) {
              updateData.resendWebhookSecretEncrypted = encrypt(webhook.signingSecret);
            }
            webhookAutoSetup = 'created';
          } else {
            webhookAutoSetup = 'failed';
          }
        }
      }
    }

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

    const { resendApiKeyEncrypted, resendWebhookSecretEncrypted, ...safeCampaign } = campaign as any;
    return NextResponse.json({
      campaign: { ...safeCampaign, resendConfigured: !!resendApiKeyEncrypted },
      ...(webhookAutoSetup ? { webhookAutoSetup } : {})
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
