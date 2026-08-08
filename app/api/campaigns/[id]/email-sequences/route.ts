import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { fillDraftsForDisplay } from '@/lib/email/fill-drafts';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;

  try {
    // Fetch all leads in this campaign along with their email sequences
    const campaignLeads = await prisma.campaignLead.findMany({
      where: { campaignId },
      include: {
        lead: {
          include: {
            emailSequences: {
              where: { campaignId },
              orderBy: { sequenceStep: 'asc' }
            }
          }
        }
      },
      orderBy: { addedAt: 'desc' }
    });

    // Never surface a raw merge tag to the reviewer, including on rows written
    // before the merge-tag guard in lib/prisma.ts existed.
    const finalized = await fillDraftsForDisplay(
      prisma,
      campaignLeads.flatMap(cl => cl.lead?.emailSequences ?? [])
    );
    const byId = new Map(finalized.map(seq => [seq.id, seq]));

    return NextResponse.json({
      campaignLeads: campaignLeads.map(cl => ({
        ...cl,
        lead: cl.lead
          ? { ...cl.lead, emailSequences: cl.lead.emailSequences.map(seq => byId.get(seq.id) ?? seq) }
          : cl.lead
      }))
    });
  } catch (error: any) {
    console.error("Fetch email sequences error:", error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
