import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { verifyEmails, OpporaApiError, type VerifyMode } from '@/services/oppora';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export const maxDuration = 60;

function opporaHttpStatus(err: OpporaApiError): number {
  if (err.statusCode === 402) return 402;
  if (err.statusCode === 429) return 429;
  if (err.statusCode === 401) return 400;
  if (err.statusCode >= 500) return 502;
  return 400;
}

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
    const { leadIds, mode: rawMode } = await req.json();
    // standard = 1 credit (fast SMTP); advanced = 2 credits (deep SMTP + catch-all pass).
    const mode: VerifyMode = rawMode === 'advanced' ? 'advanced' : 'standard';

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected.' }, { status: 400 });
    }

    // Scope to this user's leads that have an email.
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds }, userId: user.id, NOT: { email: null } },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (leads.length === 0) {
      return NextResponse.json({ error: 'None of the selected leads have an email address.' }, { status: 400 });
    }

    // Never verify an email twice: skip leads already run through Oppora.
    const pending = leads.filter(l => !l.emailVerifiedAt);
    const alreadyVerified = leads.length - pending.length;

    if (pending.length === 0) {
      return NextResponse.json({
        verified: 0,
        alreadyVerified,
        skippedNoEmail: leadIds.length - leads.length,
        summary: {},
        errors: [],
        results: [],
        message: 'All selected leads were already verified.',
      });
    }

    // Dedupe by email so identical addresses cost a single credit.
    const uniqueEmails = Array.from(new Set(pending.map(l => (l.email as string).toLowerCase())));
    const emailToLead = new Map<string, string>(); // lowercased email -> original casing sent
    for (const l of pending) emailToLead.set((l.email as string).toLowerCase(), l.email as string);

    let results: Awaited<ReturnType<typeof verifyEmails>>;
    let fatalMessage: string | null = null;
    let fatalStatus = 200;
    try {
      results = await verifyEmails(uniqueEmails.map(e => emailToLead.get(e) as string), opporaKey, mode);
    } catch (err: any) {
      if (!(err instanceof OpporaApiError)) throw err;
      // Bad key / no credits / rate-limited: keep whatever finished, report the rest.
      results = (err.partial || []).filter(Boolean);
      fatalMessage = err.message;
      fatalStatus = opporaHttpStatus(err);
      if (results.length === 0) {
        return NextResponse.json({ error: fatalMessage }, { status: fatalStatus });
      }
    }

    // Map each unique email to its result, then fan out to every pending lead.
    const resultByEmail = new Map<string, (typeof results)[number]>();
    results.forEach(r => resultByEmail.set(r.email.toLowerCase(), r));

    const verifiedAt = new Date();
    const perLead = pending.map(lead => ({
      lead,
      result: resultByEmail.get((lead.email as string).toLowerCase()),
    }));

    // Persist only successful checks; an Oppora error must not stamp the lead.
    const successful = perLead.filter(u => u.result && u.result.status !== 'Error');
    await prisma.$transaction(
      successful.map(u =>
        prisma.lead.update({
          where: { id: u.lead.id },
          data: { emailStatus: u.result!.status, emailVerifiedAt: verifiedAt },
        })
      )
    );

    const summary = successful.reduce<Record<string, number>>((acc, u) => {
      const s = u.result!.status;
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const errors = perLead
      .filter(u => !u.result || u.result.status === 'Error')
      .map(u => u.result?.error || fatalMessage || 'No result returned');

    const creditsRemaining = results.reduce<number | null>((min, r) => {
      if (typeof r.creditsRemaining !== 'number') return min;
      return min === null ? r.creditsRemaining : Math.min(min, r.creditsRemaining);
    }, null);

    return NextResponse.json({
      verified: successful.length,
      alreadyVerified,
      skippedNoEmail: leadIds.length - leads.length,
      creditsUsed: successful.length * (mode === 'advanced' ? 2 : 1),
      creditsRemaining,
      mode,
      summary,
      errors,
      warning: fatalMessage,
      results: successful.map(u => ({
        id: u.lead.id,
        email: u.lead.email,
        status: u.result!.status,
        emailVerifiedAt: verifiedAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error('Lead verification error:', err);
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 });
  }
}
