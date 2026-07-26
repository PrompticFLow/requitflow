import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { calculateScheduledAt } from '@/lib/email-scheduling';
import { processDueEmails } from '@/lib/email-dispatch';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await params;
    
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignLeads: true,
        emailSequences: true,
      }
    });

    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    });

    const calendly = await prisma.calendlyIntegration.findUnique({
      where: { userId: user.id },
    });
    const calendlyBookingLink =
      calendly?.connected && calendly.schedulingUrl ? calendly.schedulingUrl : null;

    const smtpAccount = await prisma.smtpAccount.findUnique({
      where: { userId: user.id }
    });

    // Check Sender Verification
    const hasVerifiedSmtp = smtpAccount && smtpAccount.isVerified;
    const hasVerifiedSendGrid = !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);

    if (!hasVerifiedSmtp && !hasVerifiedSendGrid) {
      return NextResponse.json({
        success: false,
        error: "Sender email is not verified. Please verify SMTP before starting this campaign."
      }, { status: 400 });
    }

    const missing: string[] = [];

    if (!campaign.bookingLink && !userSettings?.bookingLink && !calendlyBookingLink) {
      missing.push('Booking link is missing');
    }

    // Prefer Calendly scheduling URL when campaign has no booking link
    if (!campaign.bookingLink && calendlyBookingLink) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { bookingLink: calendlyBookingLink, ctaLink: calendlyBookingLink },
      });
    }

    if (!campaign.unsubscribeLine) {
      missing.push('Unsubscribe line is missing');
    }

    if (!campaign.campaignLeads || campaign.campaignLeads.length === 0) {
      missing.push('No leads selected');
    }
    
    // (Removed hardcoded 5 emails check; we only strictly require Email 1 to be approved)
    const leads = campaign.campaignLeads.map((cl: any) => cl.leadId);
    const sequences = campaign.emailSequences || [];

    // Check if Email 1 is approved for all leads in the campaign
    const approvedEmail1s = sequences.filter((s: any) => s.sequenceStep === 1 && s.approvalStatus === 'Approved');
    if (approvedEmail1s.length < leads.length) {
      return NextResponse.json({
        success: false,
        error: "Email 1 is not approved. Please approve Email 1 before starting the campaign."
      }, { status: 400 });
    }

    if (!campaign.dailyLimit || campaign.dailyLimit < 1) {
      missing.push('Daily sending limit is not configured');
    }

    if (!campaign.timezoneMode) {
      missing.push('Campaign sending timezone is missing');
    }

    if (!campaign.timingMode) {
      missing.push('Campaign sending schedule settings are missing');
    }

    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Campaign is not ready to start.',
        missing
      }, { status: 400 });
    }

    // Mark campaign as Active and record start time
    const now = new Date();
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'Active',
        startedAt: now
      }
    });

    // Schedule emails
    let queuedCount = 0;
    
    // Process each lead's sequence
    for (const leadId of leads) {
      const leadSequences = sequences.filter((s: any) => s.leadId === leadId);
      
      for (const seq of leadSequences) {
        // Only schedule/queue if approved
        if (seq.approvalStatus === 'Approved') {
          let scheduledDate: Date;
          if (seq.sequenceStep === 1) {
            // Email 1 is queued to send immediately (scheduledAt = now)
            scheduledDate = now;
          } else {
            const delayDays = seq.delayAmount || (seq.sequenceStep === 2 ? 2 : seq.sequenceStep === 3 ? 5 : seq.sequenceStep === 4 ? 8 : 12);
            scheduledDate = calculateScheduledAt({
              campaignStartDate: now,
              delayDays,
              sendWindowStart: campaign.sendingWindowStart,
              sendWindowEnd: campaign.sendingWindowEnd,
              timezone: campaign.timezoneMode,
              mode: campaign.timingMode,
              skipWeekends: !campaign.weekendsEnabled
            });
          }

          await prisma.emailSequence.update({
            where: { id: seq.id },
            data: {
              status: 'Queued',
              scheduledAt: scheduledDate,
            }
          });
          queuedCount++;
        }
      }
    }

    // Trigger immediate send of queued Email 1s
    const processResult = await processDueEmails({ userId: user.id });

    return NextResponse.json({
      success: true,
      message: 'Campaign started. Email 1 is queued to send immediately.',
      email1Queued: true,
      email1Sent: processResult.sent > 0,
      scheduled: queuedCount
    });

  } catch (error: any) {
    console.error('Campaign start error:', error);
    return NextResponse.json({ error: 'Failed to start campaign' }, { status: 500 });
  }
}
