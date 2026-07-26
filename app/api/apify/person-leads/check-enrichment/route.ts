import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getApifyRun, getApifyDatasetItems, getApifyRunDatasetItems } from '@/lib/apify/client';
import { normalizeContactEnrichment } from '@/lib/person-contact-enrichment-normalizer';
import { prisma } from '@/lib/prisma';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    let apifyToken: string;
    try {
      apifyToken = await resolveUserApiKey(user.id, 'apify');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    const url = new URL(req.url);
    const runId = url.searchParams.get('runId');

    if (!runId) return NextResponse.json({ success: false, error: 'Missing runId' }, { status: 400 });

    let runStatus: string;
    let datasetId: string;

    try {
      const data = await getApifyRun(runId, apifyToken);
      runStatus = data.status;
      datasetId = data.defaultDatasetId;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: 'AI Agent enrichment failed.', technicalError: e.message }, { status: 500 });
    }

    if (['READY', 'RUNNING'].includes(runStatus)) {
      return NextResponse.json({
        success: true,
        status: 'RUNNING',
        message: 'AI Agent is finding verified emails and phone numbers...',
        leads: []
      });
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
      return NextResponse.json({ success: false, error: 'AI Agent enrichment failed.', technicalError: `Apify run ended with status ${runStatus}` }, { status: 500 });
    }

    // Finished! Fetch dataset
    let rawItems: any[] = [];
    try {
      if (datasetId) {
        rawItems = await getApifyDatasetItems(datasetId, apifyToken);
      } else {
        rawItems = await getApifyRunDatasetItems(runId, apifyToken);
      }
    } catch (e: any) {
      console.error("Dataset fetch failed:", e.message);
    }

    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json({ success: true, status: 'SUCCEEDED', enrichedCount: 0, emailsFound: 0, phonesFound: 0, leads: [] });
    }

    const updatedLeads = [];
    let emailsFound = 0;
    let phonesFound = 0;

    for (const raw of rawItems) {
      const normalized = normalizeContactEnrichment(raw);
      
      const OR_conditions = [];
      if (normalized.linkedinUrl) OR_conditions.push({ linkedinUrl: normalized.linkedinUrl });
      if (normalized.email) OR_conditions.push({ email: normalized.email });
      if (normalized.phone) OR_conditions.push({ phone: normalized.phone });
      if (normalized.fullName && normalized.companyName) {
        OR_conditions.push({ companyName: normalized.companyName, fullName: normalized.fullName });
      }

      if (OR_conditions.length > 0) {
        try {
          const existing = await prisma.lead.findFirst({
            where: {
              userId: user.id,
              OR: OR_conditions
            }
          });

          if (existing) {
            // Update logic: do not overwrite good existing email/phone with null
            const updateData: any = {};
            if (normalized.email) {
              updateData.email = normalized.email;
              updateData.emailStatus = normalized.emailStatus;
              emailsFound++;
            }
            if (normalized.phone) {
              updateData.phone = normalized.phone;
              updateData.phoneStatus = normalized.phoneStatus;
              phonesFound++;
            }
            
            // Only update if we have new data
            if (Object.keys(updateData).length > 0) {
              // merge raw data
              let newRawData = existing.rawData;
              if (typeof newRawData === 'object' && newRawData !== null) {
                newRawData = { ...newRawData, enrichment: normalized.rawData };
              } else {
                newRawData = { enrichment: normalized.rawData };
              }
              updateData.rawData = newRawData;

              const updated = await prisma.lead.update({
                where: { id: existing.id },
                data: updateData
              });
              updatedLeads.push(updated);
            } else {
               updatedLeads.push(existing);
            }
          }
        } catch (err: any) {
          console.error("Failed to update lead during enrichment:", err.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      status: 'SUCCEEDED',
      enrichedCount: updatedLeads.length,
      emailsFound,
      phonesFound,
      leads: updatedLeads
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: 'AI Agent enrichment failed.', 
      technicalError: error.message 
    }, { status: 500 });
  }
}
