import { asc, eq, inArray, isNotNull, lt, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { DB } from "../db";
import { attachment, mailbox, mailboxShareEvent, message } from "../db/schema";
import { DAY_MS } from "../lib/time";

export const RECLAIM_WRITE_BUDGET = 1000;
export const RECLAIM_QUERY_LIMIT = 20;
export const RECLAIM_SHARE_EVENT_DAYS = 30;

const ROW_OVERHEAD = 100;

const bytes = (column: SQLWrapper) => sql`coalesce(length(cast(${column} as blob)), 0)`;

const qualified = (table: string, column: string) => sql`${sql.identifier(table)}.${sql.identifier(column)}`;

const attachmentBytesWhere = (column: "mailbox_id", owner: SQL) =>
  sql`coalesce((select sum(length(cast(a.content as blob))) from ${sql.identifier("attachment")} a where a.${sql.identifier(column)} = ${owner}), 0)`;

const mailboxBytes = sql<number>`${ROW_OVERHEAD} + coalesce((select sum(coalesce(length(cast(m.text as blob)), 0) + coalesce(length(cast(m.html as blob)), 0) + coalesce(length(cast(m.headers as blob)), 0) + length(cast(m.preview as blob)) + ${ROW_OVERHEAD}) from ${sql.identifier("message")} m where m.mailbox_id = ${qualified("mailbox", "id")}), 0) + ${attachmentBytesWhere("mailbox_id", qualified("mailbox", "id"))}`;

type Chunk<Id> = { id: Id; bytes: number }[];

type Step<Id extends string | number> = {
  name: string;
  size: number;
  pick: (db: DB, now: Date, size: number) => Promise<Chunk<Id>>;
  drop: (db: DB, ids: Id[]) => Promise<D1Response>;
};

const step = <Id extends string | number>(s: Step<Id>) => s;

export const RECLAIM_STEPS = [
  step({
    name: "attachment_content",
    size: 50,
    pick: (db, _now, size) =>
      db
        .select({ id: attachment.id, bytes: sql<number>`${bytes(attachment.content)}` })
        .from(attachment)
        .where(isNotNull(attachment.content))
        .limit(size),
    drop: (db, ids) => db.update(attachment).set({ content: null }).where(inArray(attachment.id, ids)).run(),
  }),
  step({
    name: "catch_all_mailboxes",
    size: 10,
    pick: (db, _now, size) =>
      db
        .select({ id: mailbox.id, bytes: mailboxBytes })
        .from(mailbox)
        .where(eq(mailbox.catchAll, true))
        .orderBy(asc(mailbox.expiresAt))
        .limit(size),
    drop: (db, ids) => db.delete(mailbox).where(inArray(mailbox.id, ids)).run(),
  }),
  step({
    name: "message_html",
    size: 50,
    pick: (db, _now, size) =>
      db
        .select({ id: message.id, bytes: sql<number>`${bytes(message.html)}` })
        .from(message)
        .where(isNotNull(message.html))
        .orderBy(asc(message.receivedAt))
        .limit(size),
    drop: (db, ids) => db.update(message).set({ html: null }).where(inArray(message.id, ids)).run(),
  }),
  step({
    name: "old_share_events",
    size: 50,
    pick: (db, now, size) =>
      db
        .select({
          id: mailboxShareEvent.id,
          bytes: sql<number>`${bytes(mailboxShareEvent.detail)} + ${ROW_OVERHEAD * 2}`,
        })
        .from(mailboxShareEvent)
        .where(lt(mailboxShareEvent.at, new Date(now.getTime() - RECLAIM_SHARE_EVENT_DAYS * DAY_MS)))
        .orderBy(asc(mailboxShareEvent.at))
        .limit(size),
    drop: (db, ids) => db.delete(mailboxShareEvent).where(inArray(mailboxShareEvent.id, ids)).run(),
  }),
] as const;

export type ReclaimReport = { freed: number; written: number; queries: number; steps: Record<string, number> };

export async function reclaimStorage(
  db: DB,
  needBytes: number,
  now = new Date(),
  { writeBudget = RECLAIM_WRITE_BUDGET, queryLimit = RECLAIM_QUERY_LIMIT } = {},
): Promise<ReclaimReport> {
  const report: ReclaimReport = { freed: 0, written: 0, queries: 0, steps: {} };
  const exhausted = () => report.freed >= needBytes || report.written >= writeBudget || report.queries + 2 > queryLimit;
  for (const s of RECLAIM_STEPS as readonly Step<string | number>[]) {
    while (!exhausted()) {
      const chunk = await s.pick(db, now, s.size);
      report.queries++;
      if (!chunk.length) break;
      const result = await s.drop(
        db,
        chunk.map((c) => c.id),
      );
      report.queries++;
      report.written += Number(result.meta.rows_written) || 0;
      const freed = chunk.reduce((sum, c) => sum + (Number(c.bytes) || 0), 0);
      report.freed += freed;
      report.steps[s.name] = (report.steps[s.name] ?? 0) + chunk.length;
      if (chunk.length < s.size) break;
    }
    if (exhausted()) break;
  }
  return report;
}
