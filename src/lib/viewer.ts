import { and, eq } from "drizzle-orm";
import type { DB } from "../db";
import { session as sessionTable, user } from "../db/schema";
import type { SessionClaim } from "./session-cookie";

export type Viewer = { id: string; username: string; sid: string; createdAt: Date };

const TOUCH_MS = 30 * 60 * 1000;

export const viewerQuery = (db: DB, claim: SessionClaim) =>
  db
    .select({
      id: user.id,
      username: user.username,
      disabled: user.disabled,
      createdAt: user.createdAt,
      lastSeenAt: sessionTable.lastSeenAt,
    })
    .from(sessionTable)
    .innerJoin(user, eq(user.id, sessionTable.userId))
    .where(and(eq(sessionTable.id, claim.sid), eq(sessionTable.userId, claim.userId)));

export type ViewerRow = Awaited<ReturnType<typeof viewerQuery>>[number];

export const needsTouch = (row: ViewerRow, now: Date) => now.getTime() - row.lastSeenAt.getTime() > TOUCH_MS;

export const touchSession = (db: DB, sid: string, userId: string, now: Date) =>
  db.batch([
    db.update(sessionTable).set({ lastSeenAt: now }).where(eq(sessionTable.id, sid)),
    db.update(user).set({ lastSeenAt: now }).where(eq(user.id, userId)),
  ]);

export const toViewer = (row: ViewerRow, sid: string): Viewer => ({ id: row.id, username: row.username, sid, createdAt: row.createdAt });
