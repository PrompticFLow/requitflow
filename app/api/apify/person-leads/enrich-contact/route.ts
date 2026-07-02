import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildContactEnrichmentInput } from '@/lib/apify/person-contact-enrichment-input';
import { startApifyActorRun } from '@/lib/apify/client';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      return NextResponse.json({ success: false, error: 'API token not configured.' }, { status: 500 });
    }

    const actorId = process.env.PERSON_CONTACT_ENRICHMENT_ACTOR_ID;
    if (!actorId) {
      return NextResponse.json({
        success: false,
        error: "Email and phone enrichment is not configured.",
        technicalError: "Missing PERSON_CONTACT_ENRICHMENT_ACTOR_ID."
      });
    }

    const body = await req.json();
    let leadsToEnrich = [];

    if (body.leadIds && Array.isArray(body.leadIds) && body.leadIds.length > 0) {
      leadsToEnrich = await prisma.lead.findMany({
        where: {
          id: { in: body.leadIds },
          userId: user.id
        }
      });
    } else if (body.leads && Array.isArray(body.leads) && body.leads.length > 0) {
      leadsToEnrich = body.leads;
    } else {
      return NextResponse.json({ success: false, error: 'No leads provided for enrichment.' }, { status: 400 });
    }

    if (leadsToEnrich.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid leads found for enrichment.' }, { status: 400 });
    }

    const input = buildContactEnrichmentInput(leadsToEnrich);
    
    // Start enrichment actor
    const run = await startApifyActorRun(actorId, input);

    return NextResponse.json({
      success: true,
      runId: run.id,
      message: 'Contact enrichment started.'
    });

  } catch (error: any) {
    console.error("Enrichment start error:", error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to start contact enrichment.', 
      technicalError: error.message 
    }, { status: 500 });
  }
}
