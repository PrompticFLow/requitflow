import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = (await params).id;
    const { campaignId } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // Verify campaign belongs to user
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, userId: user.id }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    
    // Fetch the company details
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        jobs: {
          select: { category: true }
        }
      }
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check if a Lead already exists for this user and company
    let lead = await prisma.lead.findFirst({
      where: {
        userId: user.id,
        OR: [
          { companyId: company.id },
          company.website ? { website: company.website } : {},
          { businessName: { equals: company.name, mode: 'insensitive' }, country: { equals: company.country || undefined, mode: 'insensitive' } }
        ]
      }
    });

    if (!lead) {
      // Create a new Lead
      const categories = new Set<string>();
      company.jobs.forEach(j => {
        if (j.category) categories.add(j.category);
      });
      const mainCategory = categories.size > 0 ? Array.from(categories)[0] : null;

      let leadTier = 'Cold';
      if (company.hiringActivity === 'High Activity' && company.website) leadTier = 'Hot';
      else if (company.hiringActivity === 'Medium Activity' || company.activeJobPostCount > 0) leadTier = 'Warm';

      lead = await prisma.lead.create({
        data: {
          userId: user.id,
          companyId: company.id,
          businessName: company.name,
          website: company.website,
          location: company.location,
          country: company.country,
          category: mainCategory,
          aiInsight: company.aiHiringInsight,
          leadScore: leadTier === 'Hot' ? 80 : leadTier === 'Warm' ? 50 : 20,
          leadTier: leadTier,
          source: company.source ? `${company.source.toUpperCase()}_JOB_RESEARCH` : 'JOB_RESEARCH',
          status: 'New'
        }
      });
    } else {
      // Update company link just in case
      await prisma.lead.update({
        where: { id: lead.id },
        data: { companyId: company.id }
      });
    }

    // Attach to CampaignLead
    const existingCampaignLead = await prisma.campaignLead.findUnique({
      where: {
        campaignId_leadId: {
          campaignId: campaign.id,
          leadId: lead.id
        }
      }
    });

    if (existingCampaignLead) {
      return NextResponse.json({ success: true, status: 'Already Exists', leadId: lead.id });
    }

    await prisma.campaignLead.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        status: 'Pending'
      }
    });

    return NextResponse.json({ success: true, status: 'Added', leadId: lead.id });

  } catch (error: any) {
    console.error('Add to Campaign error:', error);
    return NextResponse.json({ error: 'Failed to add company to campaign' }, { status: 500 });
  }
}
