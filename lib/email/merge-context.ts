import type { MergeTagContext } from './fill-merge-tags';

/**
 * Loads the lead / campaign / user records needed to resolve merge tags.
 *
 * Callers pass the *base* Prisma client so this can never recurse back through
 * the merge-tag guard extension in lib/prisma.ts.
 */

interface MergeIds {
  userId?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
}

const TTL_MS = 15_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { value: any; expiresAt: number }>();

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: any) {
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

async function loadOnce(key: string, loader: () => Promise<any>) {
  const cached = readCache(key);
  if (cached !== undefined) return cached;
  const value = await loader().catch(() => null);
  writeCache(key, value);
  return value;
}

export async function loadMergeContext(db: any, ids: MergeIds): Promise<MergeTagContext> {
  const [lead, campaign, user] = await Promise.all([
    ids.leadId
      ? loadOnce(`lead:${ids.leadId}`, () => db.lead.findUnique({ where: { id: ids.leadId } }))
      : Promise.resolve(null),
    ids.campaignId
      ? loadOnce(`campaign:${ids.campaignId}`, () => db.campaign.findUnique({ where: { id: ids.campaignId } }))
      : Promise.resolve(null),
    ids.userId
      ? loadOnce(`user:${ids.userId}`, () =>
          db.user.findUnique({ where: { id: ids.userId }, select: { id: true, name: true, email: true } })
        )
      : Promise.resolve(null),
  ]);

  return { lead, campaign, user };
}

/** Clears the short-lived record cache (used by scripts and tests). */
export function clearMergeContextCache() {
  cache.clear();
}

/**
 * Pulls the owning ids out of a Prisma write payload, supporting both scalar
 * foreign keys (`leadId: 'x'`) and relation connects (`lead: { connect: { id } }`).
 */
export function extractMergeIds(data: any): MergeIds {
  if (!data || typeof data !== 'object') return {};
  const pick = (scalar: string, relation: string) =>
    data[scalar] ?? data[relation]?.connect?.id ?? data[relation]?.connect?.where?.id ?? null;

  return {
    userId: pick('userId', 'user'),
    campaignId: pick('campaignId', 'campaign'),
    leadId: pick('leadId', 'lead'),
  };
}
