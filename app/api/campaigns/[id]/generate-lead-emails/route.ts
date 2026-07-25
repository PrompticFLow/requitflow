import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  sequenceStepCount,
  isHiringTrack,
  generateSequenceForLead,
  regenerateStepForLead,
} from '@/services/email-sequence-generator';

export const maxDuration = 300;

const BATCH_SIZE = 4;

function trackLabel(lead: any): string {
  return isHiringTrack(lead)
    ? 'Track A (Actively Hiring)'
    : 'Track B (Future Potential)';
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { leadIds: providedLeadIds, leadId, step } = body;

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.userId !== user.id) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const senderName = campaign.senderName || user.name || '';
    const stepCount = sequenceStepCount(campaign);

    // ─── Single-step regeneration ─────────────────────────────────────────────
    if (leadId && step) {
      const stepNum = parseInt(String(step));
      if (isNaN(stepNum) || stepNum < 1 || stepNum > stepCount) {
        return NextResponse.json({ error: `Step must be between 1 and ${stepCount}.` }, { status: 400 });
      }

      const lead = await prisma.lead.findFirst({ where: { id: leadId, userId: user.id } });
      if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

      const existing = await prisma.emailSequence.findMany({
        where: { campaignId, leadId, sequenceStep: { lte: stepCount } },
        orderBy: { sequenceStep: 'asc' }
      });

      const generated = await regenerateStepForLead(campaign, lead, senderName, stepNum, stepCount, existing);

      const target = existing.find(e => e.sequenceStep === stepNum);
      const data = {
        name: `Email ${stepNum}`,
        subject: generated.subject,
        body: generated.body,
        aiOriginalSubject: generated.subject,
        aiOriginalBody: generated.body,
        emailType: generated.type || null,
        delayAmount: generated.delayDays,
        delayUnit: 'business_days',
        status: 'Draft',
        approvalStatus: 'Pending',
        aiGenerationReason: `Regenerated from lead research data — ${trackLabel(lead)}`,
      };

      const email = target
        ? await prisma.emailSequence.update({ where: { id: target.id }, data })
        : await prisma.emailSequence.create({
            data: { ...data, userId: user.id, campaignId, leadId, sequenceStep: stepNum, ctaLink: campaign.bookingLink || campaign.ctaLink || '' }
          });

      return NextResponse.json({ success: true, email });
    }

    // ─── Bulk generation for leads missing sequence steps ─────────────────────
    let leadIds: string[] = providedLeadIds || [];
    if (!leadIds.length) {
      const campaignLeads = await prisma.campaignLead.findMany({
        where: { campaignId },
        select: { leadId: true }
      });
      leadIds = campaignLeads.map(cl => cl.leadId);
    }

    if (!leadIds.length) {
      return NextResponse.json({ error: 'No leads found for this campaign. Add leads before generating emails.' }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({ where: { id: { in: leadIds }, userId: user.id } });

    let generatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedDetails: { leadId: string; reason: string }[] = [];

    const generateForLead = async (lead: any) => {
      try {
        const existing = await prisma.emailSequence.findMany({
          where: { campaignId, leadId: lead.id, sequenceStep: { lte: stepCount } },
          select: { sequenceStep: true }
        });
        const existingSteps = new Set(existing.map(e => e.sequenceStep));
        const missingSteps = Array.from({ length: stepCount }, (_, i) => i + 1)
          .filter(s => !existingSteps.has(s));

        if (missingSteps.length === 0) return { skipped: true };

        const emails = await generateSequenceForLead(campaign, lead, senderName, stepCount);

        let created = 0;
        for (const email of emails) {
          if (!missingSteps.includes(email.step)) continue;
          await prisma.emailSequence.create({
            data: {
              userId: user.id,
              campaignId,
              leadId: lead.id,
              name: `Email ${email.step}`,
              subject: email.subject,
              body: email.body,
              sequenceStep: email.step,
              ctaLink: campaign.bookingLink || campaign.ctaLink || '',
              delayAmount: email.delayDays,
              delayUnit: 'business_days',
              status: 'Draft',
              approvalStatus: 'Pending',
              aiOriginalSubject: email.subject,
              aiOriginalBody: email.body,
              emailType: email.type || null,
              aiGenerationReason: `Generated from lead research data — ${trackLabel(lead)}`,
            }
          });
          created++;
        }

        await prisma.campaignLead.update({
          where: { campaignId_leadId: { campaignId, leadId: lead.id } },
          data: { status: 'Email Generated' }
        }).catch(() => {});

        return { created };
      } catch (err: any) {
        console.error('Sequence generation failed for lead', lead.id, err);
        return { failed: true, leadId: lead.id, reason: err?.message || 'Generation failed' };
      }
    };

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(generateForLead));
      for (const r of results) {
        if (r.skipped) skippedCount++;
        else if (r.failed) { failedCount++; failedDetails.push({ leadId: r.leadId!, reason: r.reason! }); }
        else generatedCount += r.created || 0;
      }
    }

    if (generatedCount === 0 && failedCount > 0) {
      return NextResponse.json({
        error: `Email generation failed. ${failedDetails[0]?.reason || ''}`.trim(),
        failedDetails
      }, { status: 500 });
    }

    let message = `Created ${generatedCount} email drafts.`;
    if (skippedCount > 0) message += ` ${skippedCount} leads already had full sequences.`;
    if (failedCount > 0) message += ` ${failedCount} leads failed.`;

    return NextResponse.json({
      success: true,
      message,
      created: generatedCount,
      skipped: skippedCount,
      failed: failedCount,
      failedDetails
    });
  } catch (error: any) {
    console.error('Generate lead emails error:', error);
    const msg = error?.message === 'OPENROUTER_API_KEY is not configured.'
      ? 'OpenRouter is not connected. Add OPENROUTER_API_KEY to your .env file and restart the server.'
      : (error?.message || 'Email generation failed. Please try again.');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
