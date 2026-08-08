import { draftHasMergeTags, fillMergeTagsInDraft } from '@/lib/email/fill-merge-tags';

/**
 * Read-side safety net for the review / preview screens.
 *
 * New drafts are already cleaned on write by the guard in lib/prisma.ts, so
 * this is a no-op for them (one `draftHasMergeTags` check, no queries). It
 * exists so rows written *before* that guard — or by anything that bypasses
 * Prisma — still render as the final email the prospect would receive.
 */
export async function fillDraftsForDisplay<T extends Record<string, any>>(
  db: any,
  drafts: T[]
): Promise<T[]> {
  if (!Array.isArray(drafts) || drafts.length === 0) return drafts;

  const stale = drafts.filter(draftHasMergeTags);
  if (stale.length === 0) return drafts;

  const uniq = (values: any[]) => Array.from(new Set(values.filter(Boolean))) as string[];
  const campaignIds = uniq(stale.map((d) => d.campaignId));
  const leadIds = uniq(stale.map((d) => d.leadId));
  const userIds = uniq(stale.map((d) => d.userId));

  const [campaigns, leads, users] = await Promise.all([
    campaignIds.length ? db.campaign.findMany({ where: { id: { in: campaignIds } } }) : [],
    leadIds.length ? db.lead.findMany({ where: { id: { in: leadIds } } }) : [],
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [],
  ]);

  const byId = (rows: any[]) => new Map(rows.map((row: any) => [row.id, row]));
  const campaignMap = byId(campaigns);
  const leadMap = byId(leads);
  const userMap = byId(users);

  return drafts.map((draft) =>
    draftHasMergeTags(draft)
      ? fillMergeTagsInDraft(draft, {
          campaign: campaignMap.get(draft.campaignId),
          lead: leadMap.get(draft.leadId) ?? draft.lead,
          user: userMap.get(draft.userId),
        })
      : draft
  );
}
