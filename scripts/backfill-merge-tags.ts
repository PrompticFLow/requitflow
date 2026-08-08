/**
 * One-off backfill: rewrites any EmailSequence row still holding raw merge tags
 * ({{painPoints}}, [Your Name], FIRST_NAME, …) with its final personalized text.
 *
 * New rows can no longer reach this state — lib/prisma.ts fills merge tags on
 * every write — so this exists purely to clean drafts created before that guard.
 *
 *   npx tsx scripts/backfill-merge-tags.ts          # report only
 *   npx tsx scripts/backfill-merge-tags.ts --apply  # write the fixes
 */

import { PrismaClient } from '@prisma/client';
import {
  EMAIL_CONTENT_FIELDS,
  draftHasMergeTags,
  fillMergeTags,
} from '../lib/email/fill-merge-tags';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const drafts = await prisma.emailSequence.findMany({
    where: { deletedAt: null },
    include: { campaign: true, lead: true, user: { select: { id: true, name: true, email: true } } },
  });

  const stale = drafts.filter(draftHasMergeTags);
  console.log(`Scanned ${drafts.length} drafts — ${stale.length} contain raw merge tags.`);

  let updated = 0;
  for (const draft of stale) {
    const ctx = { campaign: draft.campaign, lead: draft.lead, user: draft.user };
    const data: Record<string, string> = {};

    for (const field of EMAIL_CONTENT_FIELDS) {
      const value = (draft as any)[field];
      if (typeof value !== 'string') continue;
      const filled = fillMergeTags(value, ctx);
      if (filled !== value) data[field] = filled;
    }

    if (Object.keys(data).length === 0) continue;

    console.log(`\n${draft.id} (${draft.lead?.businessName ?? 'unknown lead'}, step ${draft.sequenceStep})`);
    for (const [field, value] of Object.entries(data)) {
      console.log(`  ${field}: ${JSON.stringify(value.slice(0, 160))}`);
    }

    if (apply) {
      await prisma.emailSequence.update({ where: { id: draft.id }, data });
      updated++;
    }
  }

  console.log(
    apply
      ? `\nUpdated ${updated} drafts.`
      : `\nDry run — re-run with --apply to write these changes.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
