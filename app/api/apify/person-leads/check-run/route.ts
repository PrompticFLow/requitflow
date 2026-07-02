import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { normalizeLinkedInProfileLead } from '@/lib/person-lead-normalizer';
import { validatePersonLead } from '@/lib/person-lead-validation';
import { getApifyRun, getApifyDatasetItems, getApifyRunDatasetItems } from '@/lib/apify/client';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const runId = url.searchParams.get('runId');

    if (!runId) return NextResponse.json({ success: false, error: 'Missing runId' }, { status: 400 });

    let runStatus: string;
    let datasetId: string;

    try {
      const data = await getApifyRun(runId);
      runStatus = data.status;
      datasetId = data.defaultDatasetId;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: 'AI Agent search failed.', technicalError: e.message }, { status: 500 });
    }

    if (['READY', 'RUNNING'].includes(runStatus)) {
      return NextResponse.json({
        success: true,
        status: 'RUNNING',
        message: 'AI Agent is searching live candidates...',
        leads: []
      });
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
      return NextResponse.json({ success: false, error: 'AI Agent search failed.', technicalError: `Apify run ended with status ${runStatus}` }, { status: 500 });
    }

    // Finished! Fetch dataset
    let rawItems: any[] = [];
    try {
      if (datasetId) {
        rawItems = await getApifyDatasetItems(datasetId);
      } else {
        rawItems = await getApifyRunDatasetItems(runId);
      }
      
      console.log("PERSON SEARCH DATASET FETCH", {
        runId,
        defaultDatasetId: datasetId,
        rawCount: rawItems.length,
      });

      if (rawItems.length > 0) {
        console.log("PERSON SEARCH FIRST RAW ITEM", JSON.stringify(rawItems[0], null, 2).slice(0, 3000));
      }
    } catch (e: any) {
      console.error("Dataset fetch failed:", e.message);
    }

    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json({ success: true, status: 'SUCCEEDED', rawCount: 0, imported: 0, leads: [] });
    }

    const savedLeads = [];
    let validCount = 0;
    let needsReviewCount = 0;
    let invalidCount = 0;
    let saveErrors = 0;

    for (const raw of rawItems) {
      // Normalize using the specific LinkedIn profile normalizer
      // Note: we can optionally pass fallbacks from the start request if they were saved, 
      // but the API is GET and doesn't get them. They're lost unless passed in DB. 
      // For now we just normalize raw data.
      const normalized = normalizeLinkedInProfileLead(raw);
      const validated = validatePersonLead(normalized);

      if (validated.validationStatus === 'Valid') validCount++;
      else if (validated.validationStatus === 'Needs Review') needsReviewCount++;
      else invalidCount++;

      // Deduplication check
      // 1. linkedinUrl 2. email 3. phone 4. fullName + companyName
      const OR_conditions = [];
      if (validated.linkedinUrl) OR_conditions.push({ linkedinUrl: validated.linkedinUrl });
      if (validated.email) OR_conditions.push({ email: validated.email });
      if (validated.phone) OR_conditions.push({ phone: validated.phone });
      
      if (validated.fullName && validated.companyName) {
        OR_conditions.push({ companyName: validated.companyName, fullName: validated.fullName });
      }

      try {
        let existing = null;
        if (OR_conditions.length > 0) {
          existing = await prisma.lead.findFirst({
            where: {
              userId: user.id,
              OR: OR_conditions
            }
          });
        }

        const leadData = {
          businessName: validated.businessName,
          firstName: validated.firstName,
          lastName: validated.lastName,
          fullName: validated.fullName,
          jobTitle: validated.jobTitle,
          linkedinUrl: validated.linkedinUrl,
          industry: validated.industry,
          phone: validated.phone,
          email: validated.email,
          website: validated.website,
          country: validated.country,
          location: validated.location,
          businessCategory: validated.businessCategory,
          googleMapsUrl: validated.googleMapsUrl,
          emailStatus: validated.emailStatus,
          phoneStatus: validated.phoneStatus,
          aiFitScore: validated.aiFitScore,
          aiFitReason: validated.aiFitReason,
          source: validated.source,
          sourceUrl: validated.sourceUrl,
          rawData: validated.rawData as any,
          status: validated.validationStatus === 'Invalid' ? 'Invalid' : 'New'
        };

        if (existing) {
          // Update missing fields
          const updated = await prisma.lead.update({
            where: { id: existing.id },
            data: {
              ...(!existing.email && { email: leadData.email, emailStatus: leadData.emailStatus }),
              ...(!existing.phone && { phone: leadData.phone, phoneStatus: leadData.phoneStatus }),
              ...(!existing.linkedinUrl && { linkedinUrl: leadData.linkedinUrl }),
              ...(!existing.jobTitle && { jobTitle: leadData.jobTitle }),
              ...(!existing.firstName && { firstName: leadData.firstName }),
              ...(!existing.lastName && { lastName: leadData.lastName }),
              ...(!existing.fullName && { fullName: leadData.fullName }),
              ...(!existing.aiFitScore && { aiFitScore: leadData.aiFitScore, aiFitReason: leadData.aiFitReason }),
            }
          });
          savedLeads.push(updated);
        } else {
          // Create new
          const created = await prisma.lead.create({
            data: {
              ...leadData,
              userId: user.id,
            }
          });
          savedLeads.push(created);
        }
      } catch (err: any) {
        console.error("Failed to save lead:", err.message);
        // Still add normalized lead to display on frontend
        savedLeads.push(validated);
        saveErrors++;
      }
    }
    
    const debugData = {
      rawCount: rawItems.length,
      normalizedCount: savedLeads.length,
      valid: validCount,
      needsReview: needsReviewCount,
      invalid: invalidCount,
      firstRawItemKeys: rawItems[0] ? Object.keys(rawItems[0]) : [],
    };
    
    console.log("PERSON LEADS DEBUG COUNTS", debugData);

    let enrichment: any = { started: false, reason: "Email and phone enrichment is not configured." };
    
    // Check if auto-enrichment is configured
    const enrichmentActorId = process.env.PERSON_CONTACT_ENRICHMENT_ACTOR_ID;
    const autoEnrich = url.searchParams.get('autoEnrich') !== 'false';
    
    if (enrichmentActorId && autoEnrich && savedLeads.length > 0) {
      try {
        const { buildContactEnrichmentInput } = require('@/lib/apify/person-contact-enrichment-input');
        const { startApifyActorRun } = require('@/lib/apify/client');
        
        const enrichmentInput = buildContactEnrichmentInput(savedLeads);
        const enrichmentRun = await startApifyActorRun(enrichmentActorId, enrichmentInput);
        
        enrichment = {
          started: true,
          runId: enrichmentRun.id,
        };
      } catch (err: any) {
        console.error("Auto-enrichment failed to start:", err.message);
        enrichment = {
          started: false,
          reason: `Failed to start: ${err.message}`
        };
      }
    }

    return NextResponse.json({
      success: true,
      status: 'SUCCEEDED',
      ...debugData,
      imported: savedLeads.length - saveErrors,
      saved: savedLeads.length - saveErrors,
      saveErrors,
      leads: savedLeads,
      enrichment,
      ...(saveErrors > 0 && { warning: "Some leads could not be saved, but live results are shown." })
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: 'AI Agent search failed.', 
      technicalError: error.message 
    }, { status: 500 });
  }
}
