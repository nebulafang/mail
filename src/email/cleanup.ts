import { and, desc, eq, gt, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { createDb, type DB } from "../db";
import { mailbox, mailboxMember, mailboxShareEvent, message, user } from "../db/schema";
import { MAX_MESSAGES_PER_MAILBOX } from "../lib/config";
import { manageStorage } from "../lib/quota";
import { LINK_ACCESS_ACTIONS, logShare } from "../lib/share-log";
import { ACCESS_LOG_DAYS } from "../lib/share-policy";
import { loadSharePolicy } from "../lib/share-policy-store";
import { EXPIRED_LINK_GRACE_DAYS } from "../lib/share-rules";
import { DAY_MS, HOUR_MS } from "../lib/time";
import { reclaimStorage } from "./reclaim";

export async function pruneShareEvents(db: DB, now = new Date()) {
  const { retentionDays } = await loadSharePolicy(db);
  const accessDays = Math.min(retentionDays, ACCESS_LOG_DAYS);
  await db
    .delete(mailboxShareEvent)
    .where(
      or(
        lt(mailboxShareEvent.at, new Date(now.getTime() - retentionDays * DAY_MS)),
        and(inArray(mailboxShareEvent.action, LINK_ACCESS_ACTIONS), lt(mailboxShareEvent.at, new Date(now.getTime() - accessDays * DAY_MS))),
      ),
    );
}

const EXPIRED_MAILBOX_BATCH = 500;
const EXPIRED_MEMBER_BATCH = 200;
const EXPIRED_LINK_BATCH = 200;

const qualified = (table: string, column: string) => sql`${sql.identifier(table)}.${sql.identifier(column)}`;

const expireLogged = sql`exists (select 1 from ${sql.identifier("mailbox_share_event")} where ${qualified("mailbox_share_event", "mailbox_id")} = ${qualified("mailbox", "id")} and +${qualified("mailbox_share_event", "action")} = 'link_expire' and ${qualified("mailbox_share_event", "at")} >= ${qualified("mailbox", "share_expires_at")})`;

export async function expireShareLinks(db: DB, now = new Date()) {
  const expired = await db
    .select({ id: mailbox.id, address: mailbox.address, shareExpiresAt: mailbox.shareExpiresAt })
    .from(mailbox)
    .where(and(isNotNull(mailbox.shareToken), lte(mailbox.shareExpiresAt, now), sql`not ${expireLogged}`))
    .limit(EXPIRED_LINK_BATCH);
  if (expired.length) {
    const logs = expired.map((box) =>
      logShare(db, {
        box,
        action: "link_expire",
        detail: { expiresAt: box.shareExpiresAt?.getTime() ?? null },
        source: "system",
        at: box.shareExpiresAt ?? now,
      }),
    );
    await db.batch(logs as unknown as [(typeof logs)[number], ...typeof logs]);
  }
  await db
    .update(mailbox)
    .set({ shareToken: null, shareExpiresAt: null })
    .where(lt(mailbox.shareExpiresAt, new Date(now.getTime() - EXPIRED_LINK_GRACE_DAYS * DAY_MS)));
}

export async function deleteExpiredMailboxes(db: DB, now = new Date(), limit = EXPIRED_MAILBOX_BATCH) {
  await db
    .delete(mailbox)
    .where(
      inArray(
        mailbox.id,
        db.select({ id: mailbox.id }).from(mailbox).where(lt(mailbox.expiresAt, now)).orderBy(mailbox.expiresAt).limit(limit),
      ),
    );
}

const TRIM_WINDOW_MS = 2 * HOUR_MS;
const TRIM_MAILBOX_BATCH = 5;
const TRIM_DELETE_BATCH = 500;
const TRIM_RECENT_SCAN = 2000;

export async function trimMailboxes(db: DB, now = new Date(), keep = MAX_MESSAGES_PER_MAILBOX) {
  const recent = await db
    .select({ id: message.mailboxId })
    .from(message)
    .where(gt(message.receivedAt, new Date(now.getTime() - TRIM_WINDOW_MS)))
    .orderBy(desc(message.receivedAt))
    .limit(TRIM_RECENT_SCAN);
  const active = [...new Set(recent.map((r) => r.id))].sort(() => Math.random() - 0.5).slice(0, TRIM_MAILBOX_BATCH);
  for (const id of active) {
    const [cutoff] = await db
      .select({ at: message.receivedAt })
      .from(message)
      .where(eq(message.mailboxId, id))
      .orderBy(desc(message.receivedAt))
      .limit(1)
      .offset(keep);
    if (!cutoff) continue;
    await db
      .delete(message)
      .where(
        inArray(
          message.id,
          db
            .select({ id: message.id })
            .from(message)
            .where(and(eq(message.mailboxId, id), lte(message.receivedAt, cutoff.at)))
            .limit(TRIM_DELETE_BATCH),
        ),
      );
  }
}

export async function cleanupExpired(env: CloudflareEnv) {
  const db = createDb(env.DB);
  const now = new Date();
  await deleteExpiredMailboxes(db, now);
  await pruneShareEvents(db, now);
  await expireShareLinks(db, now);
  await expireMembers(db, now);
  await trimMailboxes(db, now);
  await manageStorage(env, db, async (need) => (await reclaimStorage(db, need, now)).freed, now).catch((err) =>
    console.warn("存储回收失败", err),
  );
}

export async function expireMembers(db: DB, now = new Date()) {
  const expired = await db
    .select({
      id: mailboxMember.id,
      role: mailboxMember.role,
      userId: mailboxMember.userId,
      username: user.username,
      mailboxId: mailbox.id,
      address: mailbox.address,
    })
    .from(mailboxMember)
    .innerJoin(mailbox, eq(mailbox.id, mailboxMember.mailboxId))
    .innerJoin(user, eq(user.id, mailboxMember.userId))
    .where(and(isNotNull(mailboxMember.expiresAt), lt(mailboxMember.expiresAt, now)))
    .limit(EXPIRED_MEMBER_BATCH);
  if (!expired.length) return;
  const logs = expired.map((m) =>
    logShare(db, {
      box: { id: m.mailboxId, address: m.address },
      action: "expire",
      target: { id: m.userId, username: m.username },
      detail: { role: m.role },
      source: "system",
      at: now,
    }),
  );
  await db.batch([
    db.delete(mailboxMember).where(inArray(mailboxMember.id, expired.map((m) => m.id))),
    ...logs,
  ]);
}
