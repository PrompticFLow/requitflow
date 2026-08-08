// Force cache invalidation
import { PrismaClient } from '@prisma/client';
import {
  EMAIL_CONTENT_FIELDS,
  fillMergeTags,
  hasMergeTags,
  type MergeTagContext,
} from '@/lib/email/fill-merge-tags';
import { extractMergeIds, loadMergeContext } from '@/lib/email/merge-context';

/**
 * ─── Merge-tag guard ──────────────────────────────────────────────────────────
 *
 * Every EmailSequence write goes through fillMergeTags before it hits the
 * database, so a draft can never be *stored* with a raw {{painPoints}} /
 * [Your Name] token. That means the review screen, the approve action and the
 * send path all read content that is already final — no matter which route,
 * cron job or script produced it.
 *
 * `aiOriginalSubject` / `aiOriginalBody` are intentionally left alone: they are
 * the audit trail of what the model actually returned.
 */

type WriteData = Record<string, any>;

/** Prisma allows `{ subject: 'x' }` and `{ subject: { set: 'x' } }`. */
function readField(data: WriteData, field: string): string | null {
  const value = data?.[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.set === 'string') return value.set;
  return null;
}

function writeField(data: WriteData, field: string, next: string) {
  const value = data[field];
  if (value && typeof value === 'object' && typeof value.set === 'string') data[field] = { ...value, set: next };
  else data[field] = next;
}

function writeNeedsFilling(data: WriteData | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  return EMAIL_CONTENT_FIELDS.some((field) => hasMergeTags(readField(data, field)));
}

/** Returns a filled copy; the original payload is never mutated. */
function fillWrite(data: WriteData, ctx: MergeTagContext): WriteData {
  const next: WriteData = { ...data };
  for (const field of EMAIL_CONTENT_FIELDS) {
    const value = readField(next, field);
    if (value === null || !hasMergeTags(value)) continue;
    const filled = fillMergeTags(value, ctx);
    if (filled !== value) writeField(next, field, filled);
  }
  return next;
}

function warnUnfilled(operation: string, rowCount: number) {
  console.warn(
    `[merge-tag-guard] emailSequence.${operation} wrote content with merge tags but the ` +
      `owning lead/campaign could not be resolved (${rowCount} row(s)). The stored copy keeps ` +
      `its tags; the review and send paths will fill them.`
  );
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: ['query'],
  });

  const idSelect = { id: true, userId: true, campaignId: true, leadId: true } as const;

  /**
   * An update payload rarely carries the owning ids, so we read them off the
   * stored row. Returns null when they cannot be resolved — e.g. inside an
   * interactive transaction, where the row is not yet visible to this client.
   * Filling with an empty context there would silently downgrade "Hi Matt" to
   * "Hi there", so we leave the copy untouched instead and let the read/send
   * layers (fillDraftsForDisplay, email-dispatch) resolve it with real data.
   */
  async function resolveIdsForWrite(where: any, fallbackData: any) {
    const fromPayload = extractMergeIds(fallbackData);
    if (fromPayload.leadId && fromPayload.campaignId) return fromPayload;

    const existing = await base.emailSequence
      .findUnique({ where, select: idSelect })
      .catch(() => null);
    if (existing) return extractMergeIds(existing);

    if (fromPayload.leadId || fromPayload.campaignId) return fromPayload;

    warnUnfilled('update', 1);
    return null;
  }

  return base.$extends({
    name: 'email-merge-tag-guard',
    query: {
      emailSequence: {
        async create({ args, query }) {
          if (!writeNeedsFilling(args.data as WriteData)) return query(args);
          const ctx = await loadMergeContext(base, extractMergeIds(args.data));
          args.data = fillWrite(args.data as WriteData, ctx) as typeof args.data;
          return query(args);
        },

        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          if (!rows.some((row) => writeNeedsFilling(row as WriteData))) return query(args);

          const filled = [];
          for (const row of rows) {
            if (!writeNeedsFilling(row as WriteData)) {
              filled.push(row);
              continue;
            }
            const ctx = await loadMergeContext(base, extractMergeIds(row));
            filled.push(fillWrite(row as WriteData, ctx));
          }
          args.data = filled as typeof args.data;
          return query(args);
        },

        async update({ args, query }) {
          if (!writeNeedsFilling(args.data as WriteData)) return query(args);
          const ids = await resolveIdsForWrite(args.where, args.data);
          if (!ids) return query(args);
          const ctx = await loadMergeContext(base, ids);
          args.data = fillWrite(args.data as WriteData, ctx) as typeof args.data;
          return query(args);
        },

        async upsert({ args, query }) {
          if (writeNeedsFilling(args.create as WriteData)) {
            const ctx = await loadMergeContext(base, extractMergeIds(args.create));
            args.create = fillWrite(args.create as WriteData, ctx) as typeof args.create;
          }
          if (writeNeedsFilling(args.update as WriteData)) {
            const ids = await resolveIdsForWrite(args.where, args.create);
            if (ids) {
              const ctx = await loadMergeContext(base, ids);
              args.update = fillWrite(args.update as WriteData, ctx) as typeof args.update;
            }
          }
          return query(args);
        },

        async updateMany({ args, query }) {
          // Bulk status changes (the only real callers) carry no content fields
          // and short-circuit here without touching the database.
          if (!writeNeedsFilling(args.data as WriteData)) return query(args);

          const rows = await base.emailSequence
            .findMany({ where: args.where, select: idSelect, take: 200 })
            .catch(() => [] as any[]);

          // A single shared context is the only thing updateMany can express.
          // With mixed owners we leave the copy alone rather than personalizing
          // every row for one lead — the read and send layers fill it correctly.
          const sameOwner =
            rows.length > 0 &&
            rows.every(
              (row) =>
                row.userId === rows[0].userId &&
                row.campaignId === rows[0].campaignId &&
                row.leadId === rows[0].leadId
            );
          if (!sameOwner) {
            warnUnfilled('updateMany', rows.length);
            return query(args);
          }

          const ctx = await loadMergeContext(base, extractMergeIds(rows[0]));
          args.data = fillWrite(args.data as WriteData, ctx) as typeof args.data;
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = global as unknown as { prisma: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Merge-tag helpers reused by read paths and the backfill script. */
export { fillMergeTags, hasMergeTags };
