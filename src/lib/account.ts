import { eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { mailbox } from "../db/schema";
import { PERMANENT_AT } from "./config";

export const accountSummaryQuery = (db: DB, userId: string) =>
  db
    .select({
      mailboxes: sql<number>`count(*)`,
      permanent: sql<number>`coalesce(sum(${mailbox.expiresAt} >= ${PERMANENT_AT}), 0)`,
    })
    .from(mailbox)
    .where(eq(mailbox.ownerId, userId));

export const toAccountSummary = (username: string, [counts]: Awaited<ReturnType<typeof accountSummaryQuery>>) => ({
  username,
  mailboxes: counts?.mailboxes ?? 0,
  permanent: counts?.permanent ?? 0,
});

export async function accountSummary(db: DB, userId: string, username: string) {
  return toAccountSummary(username, await accountSummaryQuery(db, userId));
}
