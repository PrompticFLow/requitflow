import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { normalizePersonLead } from '@/lib/person-lead-normalizer';
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
      return NextResponse.json({ 
        success: false, 
        status: 'FAILED',
        error: e.message || 'AI Agent search failed.',
        leads: []
      }, { status: 500 });
    }

    if (['READY', 'RUNNING'].includes(runStatus)) {
      return NextResponse.json({
        success: true,
        status: runStatus,
        rawCount: 0,
        validCount: 0,
        needsReviewCount: 0,
        invalidCount: 0,
        leads: []
      });
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(runStatus)) {
      return NextResponse.json({ 
        success: false, 
        status: "FAILED",
        error: `Apify run ended with status ${runStatus}`,
        leads: []
      }, { status: 500 });
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
      return NextResponse.json({ 
        success: true, 
        status: runStatus || 'SUCCEEDED', 
        rawCount: 0, 
        validCount: 0,
        needsReviewCount: 0,
        invalidCount: 0,
        leads: [] 
      });
    }

    const rawLeadsData = [];
    let validCount = 0;
    let needsReviewCount = 0;
    let invalidCount = 0;

    for (const raw of rawItems) {
      let normalized;
      let validated;
      try {
        normalized = normalizePersonLead(raw);
        validated = validatePersonLead(normalized);
      } catch (normErr) {
        console.error("Normalization error:", normErr);
        continue;
      }

      let classStatus = 'invalid';
      if (validated.validationStatus === 'valid' || validated.validationStatus === 'Valid') {
        validCount++;
        classStatus = 'valid';
      } else if (validated.validationStatus === 'needs_review' || validated.validationStatus === 'Needs Review') {
        needsReviewCount++;
        classStatus = 'needs_review';
      } else {
        invalidCount++;
        classStatus = 'invalid';
      }

      rawLeadsData.push({
        userId: user.id,
        apifyRunId: runId,
        source: 'Apify',
        fullName: validated.fullName || `${validated.firstName || ''} ${validated.lastName || ''}`.trim() || null,
        linkedinUrl: validated.linkedinUrl || null,
        jobTitle: validated.jobTitle || null,
        location: validated.location || validated.country || null,
        email: validated.email || null,
        phone: validated.phone || null,
        companyName: validated.businessName || validated.companyName || null,
        validationStatus: classStatus,
      });
    }

    if (rawLeadsData.length > 0) {
      try {
        await prisma.rawLead.createMany({
          data: rawLeadsData,
          skipDuplicates: true
        });
      } catch (err: any) {
        console.error("Bulk insert to RawLead failed:", err.message);
      }
    }

    const savedLeads = await prisma.rawLead.findMany({
      where: { apifyRunId: runId, userId: user.id }
    });
    
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

    console.log("NORMALIZED LEADS:", savedLeads.length);

    return NextResponse.json({
      success: true,
      status: runStatus || 'SUCCEEDED',
      rawCount: rawItems.length,
      validCount,
      needsReviewCount,
      invalidCount,
      leads: savedLeads
    });

  } catch (error: any) {
    console.error("Unhandled error in check-run route:", error);
    return NextResponse.json({ 
      success: false, 
      status: 'FAILED',
      error: error.message || 'AI Agent search failed.', 
      leads: []
    }, { status: 500 });
  }
}
