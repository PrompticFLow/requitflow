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

    // Verify leads belong to user
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
        userId: user.id
      }
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No valid leads found' }, { status: 404 });
    }

    const addedIds = [];
    const skippedIds = [];
    const invalidSkipped = [];

    for (const lead of leads) {
      if (lead.status === 'Invalid' && !forceInvalid) {
        invalidSkipped.push(lead.id);
        continue;
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
        
        addedIds.push(lead.id);
      } else {
        skippedIds.push(lead.id);
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
