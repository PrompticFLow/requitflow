import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = (await params).id;
    
    // Fetch the company details to map into Lead
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        jobs: {
          select: {
            category: true,
            title: true,
            location: true,
            city: true,
            region: true,
            country: true
          }
        }
      }
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check if a Lead already exists for this user and company
    const existingLead = await prisma.lead.findFirst({
      where: {
        userId: user.id,
        OR: [
          { companyId: company.id },
          company.website ? { website: company.website } : {},
          { businessName: { equals: company.name, mode: 'insensitive' }, country: { equals: company.country || undefined, mode: 'insensitive' } }
        ]
      }
    });

    if (existingLead) {
      // Update with latest metrics if necessary, preserving manual notes
      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          companyId: company.id,
          aiInsight: company.aiHiringInsight || existingLead.aiInsight
        }
      });
      return NextResponse.json({ success: true, status: 'Already Exists', leadId: existingLead.id });
    }

    // Determine category based on jobs
    const categories = new Set<string>();
    company.jobs.forEach(j => {
      if (j.category) categories.add(j.category);
    });
    const mainCategory = categories.size > 0 ? Array.from(categories)[0] : null;

    // Calculate lead tier logic based on activity
    let leadTier = 'Cold';
    if (company.hiringActivity === 'High Activity' && company.website) {
      leadTier = 'Hot';
    } else if (company.hiringActivity === 'Medium Activity' || company.activeJobPostCount > 0) {
      leadTier = 'Warm';
    }

    // Create a new Lead
    const newLead = await prisma.lead.create({
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

    return NextResponse.json({ success: true, status: 'Added', leadId: newLead.id });

  } catch (error: any) {
    console.error('Add to Lead error:', error);
    return NextResponse.json({ error: 'Failed to add company to leads' }, { status: 500 });
  }
}
