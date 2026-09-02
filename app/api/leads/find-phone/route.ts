import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  findPhones,
  hasPhoneIdentity,
  domainFromWebsite,
  OpporaApiError,
  type PhoneLookupInput,
} from '@/services/oppora';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export const maxDuration = 60;

function opporaHttpStatus(err: OpporaApiError): number {
  if (err.statusCode === 402) return 402;
  if (err.statusCode === 429) return 429;
  if (err.statusCode === 401) return 400;
  if (err.statusCode >= 500) return 502;
  return 400;
}

/**
 * Populate phone numbers for the selected leads via Oppora /phone/search.
 *
 * - Leads that already have a phone are left alone.
 * - Leads previously looked up with no result (phoneStatus = NotFound) are skipped
 *   unless `force` is true, so repeat clicks don't re-query the same misses.
 * - Oppora needs a LinkedIn URL, or a name + company/domain; leads with neither are skipped.
 * - Only a `valid` hit costs a phone credit; misses are free.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let opporaKey: string;
  try {
    opporaKey = await resolveUserApiKey(user.id, 'oppora');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  try {
    const { leadIds, force } = await req.json();

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected.' }, { status: 400 });
    }

    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, userId: user.id },
      select: {
        id: true,
        phone: true,
        phoneStatus: true,
        linkedinUrl: true,
        firstName: true,
        lastName: true,
        fullName: true,
        businessName: true,
        website: true,
      },
    });

    const withoutPhone = leads.filter(l => !l.phone?.trim());
    const alreadyHasPhone = leads.length - withoutPhone.length;

    const notPreviouslyMissed = force ? withoutPhone : withoutPhone.filter(l => l.phoneStatus !== 'NotFound');
    const previouslyNotFound = withoutPhone.length - notPreviouslyMissed.length;

    const inputs = notPreviouslyMissed.map(l => ({
      lead: l,
      input: {
        linkedinUrl: l.linkedinUrl,
        firstName: l.firstName,
        lastName: l.lastName,
        fullName: l.fullName,
        company: l.businessName,
        domain: domainFromWebsite(l.website),
      } as PhoneLookupInput,
    }));

    const targets = inputs.filter(i => hasPhoneIdentity(i.input));
    const skippedNoIdentity = inputs.length - targets.length;

    if (targets.length === 0) {
      const reason =
        withoutPhone.length === 0
          ? 'All selected leads already have a phone number.'
          : notPreviouslyMissed.length === 0
            ? 'These leads were already looked up with no phone found.'
            : 'None of these leads have enough details (LinkedIn URL, or name + company) to look up a phone.';
      return NextResponse.json({
        found: 0,
        notFound: 0,
        alreadyHasPhone,
        previouslyNotFound,
        skippedNoIdentity,
        errors: [],
        results: [],
        message: reason,
      });
    }

    let results: Awaited<ReturnType<typeof findPhones>>;
    let fatalMessage: string | null = null;
    try {
      results = await findPhones(targets.map(t => t.input), opporaKey);
    } catch (err: any) {
      if (!(err instanceof OpporaApiError)) throw err;
      results = err.partial || [];
      fatalMessage = err.message;
      if (results.filter(Boolean).length === 0) {
        return NextResponse.json({ error: fatalMessage }, { status: opporaHttpStatus(err) });
      }
    }

    const checkedAt = new Date();
    const perLead = targets.map((t, i) => ({ lead: t.lead, result: results[i] }));

    // Persist hits and confirmed misses; per-item errors leave the lead untouched.
    const found = perLead.filter(u => u.result?.status === 'Valid' && u.result.phone);
    const missed = perLead.filter(u => u.result && (u.result.status === 'NotFound' || u.result.status === 'Invalid'));

    await prisma.$transaction([
      ...found.map(u =>
        prisma.lead.update({
          where: { id: u.lead.id },
          data: { phone: u.result!.phone, phoneStatus: 'Valid' },
        })
      ),
      ...missed.map(u =>
        prisma.lead.update({
          where: { id: u.lead.id },
          data: { phoneStatus: 'NotFound' },
        })
      ),
    ]);

    const errors = perLead
      .filter(u => !u.result || u.result.status === 'Error')
      .map(u => u.result?.error || fatalMessage || 'No result returned');

    const creditsRemaining = results.reduce<number | null>((min, r) => {
      if (typeof r?.creditsRemaining !== 'number') return min;
      return min === null ? r.creditsRemaining : Math.min(min, r.creditsRemaining);
    }, null);

    return NextResponse.json({
      found: found.length,
      notFound: missed.length,
      alreadyHasPhone,
      previouslyNotFound,
      skippedNoIdentity,
      creditsUsed: found.length,
      creditsRemaining,
      checkedAt: checkedAt.toISOString(),
      errors,
      warning: fatalMessage,
      results: [
        ...found.map(u => ({ id: u.lead.id, phone: u.result!.phone, phoneStatus: 'Valid', source: u.result!.source })),
        ...missed.map(u => ({ id: u.lead.id, phone: null, phoneStatus: 'NotFound', source: null })),
      ],
    });
  } catch (err: any) {
    console.error('Phone lookup error:', err);
    return NextResponse.json({ error: err.message || 'Phone lookup failed' }, { status: 500 });
  }
}
