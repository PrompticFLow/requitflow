import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildPersonBulkSearchInput } from '@/lib/apify/person-bulk-search-input';
import { startApifyActorRun } from '@/lib/apify/client';
import { prisma } from '@/lib/prisma';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let APIFY_API_TOKEN: string;
    try {
      APIFY_API_TOKEN = await resolveUserApiKey(user.id, 'apify');
    } catch (e: any) {
      if (e instanceof ByokKeyMissingError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    const PERSON_BULK_SEARCH_ACTOR_ID = process.env.PERSON_BULK_SEARCH_ACTOR_ID || process.env.PERSON_VALID_LEADS_ACTOR_ID;

    if (!PERSON_BULK_SEARCH_ACTOR_ID) {
      return NextResponse.json({ success: false, error: 'AI Agent data source is not configured.', technicalError: 'Missing PERSON_BULK_SEARCH_ACTOR_ID or PERSON_VALID_LEADS_ACTOR_ID.' }, { status: 500 });
    }


    const body = await req.json();
    const { targetAudience, location, leadCount, keywords, defaultIndustry, defaultLocation, defaultCompanyNote } = body;

    if (!targetAudience) {
      return NextResponse.json({ success: false, error: 'Please enter a target audience.' }, { status: 400 });
    }
    
    if (!location) {
      return NextResponse.json({ success: false, error: 'Please enter a location.' }, { status: 400 });
    }

    const actorInput = buildPersonBulkSearchInput({
      targetAudience,
      location,
      leadCount: Number(leadCount) || 20,
      keywords: keywords || ''
    });

    console.log("PERSON SEARCH DEBUG", {
      hasToken: Boolean(APIFY_API_TOKEN),
      bulkActor: PERSON_BULK_SEARCH_ACTOR_ID,
      body,
      actorInput,
    });

    let runId = "";
    let defaultDatasetId = "";
    let runStatus = "";
    try {
      const runData = await startApifyActorRun(PERSON_BULK_SEARCH_ACTOR_ID, actorInput, APIFY_API_TOKEN);
      
      if (!runData || !runData.id) {
        return NextResponse.json(
          {
            success: false,
            error: "AI Agent search failed.",
            technicalError: "Actor started but no runId was returned.",
            rawRun: runData,
          },
          { status: 500 }
        );
      }

      runId = runData.id;
      defaultDatasetId = runData.defaultDatasetId || "";
      runStatus = runData.status;

      console.log("PERSON SEARCH START RESPONSE", {
        runId,
        defaultDatasetId,
        status: runStatus,
      });
    } catch (e: any) {
      return NextResponse.json({ 
        success: false, 
        error: 'AI Agent search failed.', 
        technicalError: e.message,
        actorId: PERSON_BULK_SEARCH_ACTOR_ID,
        inputSent: actorInput,
        statusCode: e.status
      }, { status: 500 });
    }

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        activityType: 'Apify Search',
        description: `Started LinkedIn bulk search run.`
      }
    });

    return NextResponse.json({
      success: true,
      runId,
      defaultDatasetId,
      status: runStatus,
      message: "AI Agent search started."
    });

  } catch (error: any) {
    console.error('Error starting person search:', error);
    return NextResponse.json({ success: false, error: 'AI Agent search failed.', technicalError: error.message }, { status: 500 });
  }
}
