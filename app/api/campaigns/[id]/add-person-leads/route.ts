import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: campaignId } = await params;
  
  try {
    const { leadIds, forceInvalid = false } = await req.json();
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId, userId: user.id }
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Verify leads belong to user (fetching from RawLead now)
    const rawLeads = await prisma.rawLead.findMany({
      where: {
        id: { in: leadIds },
        userId: user.id
      }
    });

    if (rawLeads.length === 0) {
      return NextResponse.json({ error: 'No valid leads found' }, { status: 404 });
    }

    const addedIds = [];
    const skippedIds = [];
    const invalidSkipped = [];

    for (const raw of rawLeads) {
      // CRM Rule: Only valid leads can be added to campaigns
      if (raw.validationStatus !== 'valid' && raw.validationStatus !== 'Valid' && !forceInvalid) {
        invalidSkipped.push(raw.id);
        continue;
      }

      // Check if CRM Lead already exists
      let lead = null;
      const OR_conditions: any[] = [{ rawLeadId: raw.id }];
      if (raw.email) OR_conditions.push({ email: raw.email });
      if (raw.linkedinUrl) OR_conditions.push({ linkedinUrl: raw.linkedinUrl });

      lead = await prisma.lead.findFirst({
        where: {
          userId: user.id,
          OR: OR_conditions
        }
      });

      if (!lead) {
        // Bridge RawLead to CRM Lead
        lead = await prisma.lead.create({
          data: {
            userId: user.id,
            rawLeadId: raw.id,
            fullName: raw.fullName,
            firstName: raw.fullName?.split(' ')[0] || undefined,
            lastName: raw.fullName?.split(' ').slice(1).join(' ') || undefined,
            linkedinUrl: raw.linkedinUrl,
            jobTitle: raw.jobTitle,
            location: raw.location,
            email: raw.email,
            phone: raw.phone,
            businessName: raw.companyName || 'Unknown',
            source: 'Apify Person Search',
            status: 'Added to Campaign',
            campaignId: campaignId
          }
        });
      }

      // Check for existing campaign lead
      const existing = await prisma.campaignLead.findUnique({
        where: {
          campaignId_leadId: {
            campaignId,
            leadId: lead.id
          }
        }
      });

      if (!existing) {
        await prisma.campaignLead.create({
          data: {
            campaignId,
            leadId: lead.id,
            status: 'Pending'
          }
        });
        
        // Update lead status
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: 'Added to Campaign', campaignId: campaignId }
        });
        
        addedIds.push(raw.id);
      } else {
        skippedIds.push(raw.id);
      }
    }

    let msg = `Successfully added ${addedIds.length} leads to campaign.`;
    if (skippedIds.length > 0) msg += ` Skipped ${skippedIds.length} duplicates.`;
    if (invalidSkipped.length > 0) msg += ` Skipped ${invalidSkipped.length} invalid leads.`;

    return NextResponse.json({ 
      success: true, 
      count: addedIds.length,
      added: addedIds.length,
      skipped: skippedIds.length,
      invalidSkipped: invalidSkipped.length,
      message: msg
    });
    
  } catch (error: any) {
    console.error('Error adding person leads to campaign:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
