import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { verifyEmails } from '@/services/neverbounce';
import { resolveUserApiKey, ByokKeyMissingError } from '@/lib/byok';

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let neverbounceKey: string;
  try {
    neverbounceKey = await resolveUserApiKey(user.id, 'neverbounce');
  } catch (e: any) {
    if (e instanceof ByokKeyMissingError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  try {
    const { leadIds } = await req.json();

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

    // Never verify an email twice: skip leads already run through NeverBounce.
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

    const results = await verifyEmails(uniqueEmails.map(e => emailToLead.get(e) as string), neverbounceKey);

    // Map each unique email to its result, then fan out to every pending lead.
    const resultByEmail = new Map<string, (typeof results)[number]>();
    results.forEach(r => resultByEmail.set(r.email.toLowerCase(), r));

    const verifiedAt = new Date();
    const perLead = pending.map(lead => ({
      lead,
      result: resultByEmail.get((lead.email as string).toLowerCase()),
    }));

    // Persist only successful checks; a NeverBounce error must not stamp the lead.
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
      .map(u => u.result?.error || 'No result returned');

    return NextResponse.json({
      verified: successful.length,
      alreadyVerified,
      skippedNoEmail: leadIds.length - leads.length,
      creditsUsed: uniqueEmails.length,
      summary,
      errors,
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
