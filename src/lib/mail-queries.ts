import { and, desc, eq, getTableColumns, gt, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db";
import { attachment, mailbox, mailboxMember, message } from "../db/schema";
import { MAILBOX_COUNT_CAP } from "./config";
import { toMailboxSharing } from "./share-status";
import { ORGANIZE_ROLES, type AccessRole, type ShareRole } from "./share-rules";

export const PREVIEW_CHARS = 160;

export const countWhen = (condition: SQL) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`;

const quoted = (roles: readonly ShareRole[]) => sql.join(roles.map((r) => sql`${r}`), sql`, `);

const col = (table: string, column: string) => sql`${sql.identifier(table)}.${sql.identifier(column)}`;
const mailboxCol = (column: string) => col("mailbox", column);
const memberCol = (column: string) => col("mailbox_member", column);

const activeMembership = (viewerId: string, roles?: readonly ShareRole[]) =>
  sql`from ${sql.identifier("mailbox_member")} where ${memberCol("mailbox_id")} = ${mailboxCol("id")} and ${memberCol("user_id")} = ${viewerId} and ${memberCol("status")} = 'active' and (${memberCol("expires_at")} is null or ${memberCol("expires_at")} > ${Date.now()})${roles ? sql` and ${memberCol("role")} in (${quoted(roles)})` : sql``}`;

export const memberOf = (viewerId: string, roles?: readonly ShareRole[]) => sql`exists (select 1 ${activeMembership(viewerId, roles)})`;

export const aliveMailbox = (now = new Date()) => and(gt(mailbox.expiresAt, now), eq(mailbox.catchAll, false));

export const memberNotExpired = (now = new Date()) => or(isNull(mailboxMember.expiresAt), gt(mailboxMember.expiresAt, now));

export const liveShareLink = (now = new Date()) =>
  and(isNotNull(mailbox.ownerId), aliveMailbox(now), or(isNull(mailbox.shareExpiresAt), gt(mailbox.shareExpiresAt, now)));

export const accessibleMailbox = (viewerId: string | null) =>
  and(aliveMailbox(), viewerId ? or(isNull(mailbox.ownerId), eq(mailbox.ownerId, viewerId), memberOf(viewerId)) : isNull(mailbox.ownerId));

export const organizableMailbox = (viewerId: string | null) =>
  and(
    aliveMailbox(),
    viewerId ? or(isNull(mailbox.ownerId), eq(mailbox.ownerId, viewerId), memberOf(viewerId, ORGANIZE_ROLES)) : isNull(mailbox.ownerId),
  );

export const roleOf = (viewerId: string | null) =>
  (viewerId
    ? sql<AccessRole>`case when ${mailboxCol("owner_id")} is null then null when ${mailboxCol("owner_id")} = ${viewerId} then 'owner' else (select ${memberCol("role")} ${activeMembership(viewerId)}) end`
    : sql<AccessRole>`null`
  ).as("access_role");

const ownerName = sql<string | null>`(select ${col("user", "username")} from ${sql.identifier("user")} where ${col("user", "id")} = ${mailboxCol("owner_id")})`.as("owner_name");

export const normalizeAddress = (address: string) => {
  try {
    return decodeURIComponent(address).toLowerCase();
  } catch {
    return address.toLowerCase();
  }
};

export const mailboxByAddress = (db: DB, address: string, viewerId: string | null) =>
  db
    .select({ ...getTableColumns(mailbox), role: roleOf(viewerId), ownerName })
    .from(mailbox)
    .where(and(eq(mailbox.address, normalizeAddress(address)), accessibleMailbox(viewerId)))
    .limit(1);

export const sharedMailboxWhere = (token: string, now = new Date()) => and(eq(mailbox.shareToken, token), liveShareLink(now));

export const expiredShareQuery = (db: DB, token: string, now = new Date()) =>
  db
    .select({ expiredAt: mailbox.shareExpiresAt })
    .from(mailbox)
    .where(and(eq(mailbox.shareToken, token), isNotNull(mailbox.ownerId), gt(mailbox.expiresAt, now), lte(mailbox.shareExpiresAt, now)))
    .limit(1);

type AccessView = {
  ownerId: string | null;
  role: AccessRole;
  ownerName: string | null;
  shareToken: string | null;
  shareExpiresAt: Date | null;
};

export function accessView<T extends AccessView>({ ownerId, role, ownerName, shareToken, shareExpiresAt, ...rest }: T) {
  const owned = !!ownerId && role === "owner";
  const member = !!ownerId && !!role && !owned;
  return {
    ...rest,
    role,
    owned,
    sharedBy: member ? ownerName : null,
    shareToken: owned ? shareToken : null,
    shareExpiresAt: owned && shareToken ? shareExpiresAt : null,
  };
}


const listColumns = {
  id: message.id,
  fromAddress: message.fromAddress,
  fromName: message.fromName,
  subject: message.subject,
  preview: message.preview,
  code: message.code,
  seen: message.seen,
  receivedAt: message.receivedAt,
};

export const messagesOfAddress = (db: DB, address: string, viewerId: string | null, limit: number) =>
  db
    .select(listColumns)
    .from(message)
    .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
    .where(and(eq(mailbox.address, normalizeAddress(address)), accessibleMailbox(viewerId)))
    .orderBy(desc(message.receivedAt))
    .limit(limit);

const attachmentColumns = {
  id: attachment.id,
  filename: attachment.filename,
  mimeType: attachment.mimeType,
  size: attachment.size,
  saved: sql`${attachment.content} is not null`.mapWith(Boolean),
};

export const attachmentsOf = (db: DB, messageId: string) =>
  db.select(attachmentColumns).from(attachment).where(eq(attachment.messageId, messageId));

export const attachmentsOfAccessible = (db: DB, messageId: string, viewerId: string | null) =>
  db
    .select(attachmentColumns)
    .from(attachment)
    .innerJoin(mailbox, eq(mailbox.id, attachment.mailboxId))
    .innerJoin(message, eq(message.id, attachment.messageId))
    .where(and(eq(attachment.messageId, messageId), accessibleMailbox(viewerId)));

type AttachmentRow = { id: string; filename: string; mimeType: string; size: number; saved: boolean };

export const withInline = (html: string | null, attachments: AttachmentRow[]) =>
  attachments.map((a) => ({ ...a, inline: !!html?.includes(`/api/attachments/${a.id}`) }));

export const ownedShareCounts = (db: DB, viewerId: string | null, address?: string) => {
  const now = new Date();
  return db
    .select({
      mailboxId: mailboxMember.mailboxId,
      active: countWhen(sql`${mailboxMember.status} = 'active'`),
      pending: countWhen(sql`${mailboxMember.status} = 'pending'`),
    })
    .from(mailboxMember)
    .innerJoin(mailbox, eq(mailbox.id, mailboxMember.mailboxId))
    .where(
      and(
        viewerId ? eq(mailbox.ownerId, viewerId) : sql`0`,
        address ? eq(mailbox.address, normalizeAddress(address)) : undefined,
        aliveMailbox(now),
        memberNotExpired(now),
      ),
    )
    .groupBy(mailboxMember.mailboxId);
};

type ShareCountRows = Awaited<ReturnType<typeof ownedShareCounts>>;

export function withSharing<T extends { id: string; owned: boolean; shareToken: string | null; shareExpiresAt: Date | null }>(
  view: T,
  counts: ShareCountRows,
) {
  if (!view.owned) return { ...view, sharing: null };
  const row = counts.find((c) => c.mailboxId === view.id);
  return { ...view, sharing: toMailboxSharing(row, view.shareToken, view.shareExpiresAt) };
}

export const memberMailboxIds = (db: DB, viewerId: string, now = new Date()) =>
  db
    .select({ id: mailboxMember.mailboxId })
    .from(mailboxMember)
    .where(and(eq(mailboxMember.userId, viewerId), eq(mailboxMember.status, "active"), memberNotExpired(now)));

const cappedCount = (extra: SQL) =>
  sql<number>`(select count(*) from (select 1 from ${sql.identifier("message")} m where m.mailbox_id = ${mailboxCol("id")}${extra} limit ${MAILBOX_COUNT_CAP}))`.mapWith(Number);

export function mailboxSummaries(db: DB, addresses: string[], viewerId: string | null) {
  const wanted = viewerId
    ? or(
        addresses.length ? inArray(mailbox.address, addresses) : undefined,
        eq(mailbox.ownerId, viewerId),
        inArray(mailbox.id, memberMailboxIds(db, viewerId)),
      )
    : inArray(mailbox.address, addresses);
  const visible = and(wanted, accessibleMailbox(viewerId));
  return [
    db
      .select({
        id: mailbox.id,
        address: mailbox.address,
        expiresAt: mailbox.expiresAt,
        createdAt: mailbox.createdAt,
        ownerId: mailbox.ownerId,
        role: roleOf(viewerId),
        ownerName,
        note: mailbox.note,
        shareToken: mailbox.shareToken,
        shareExpiresAt: mailbox.shareExpiresAt,
        total: cappedCount(sql``),
        unread: cappedCount(sql` and m.seen = 0`),
      })
      .from(mailbox)
      .where(visible),
    db
      .select({
        mailboxId: message.mailboxId,
        id: message.id,
        fromAddress: message.fromAddress,
        fromName: message.fromName,
        subject: message.subject,
        code: message.code,
        seen: message.seen,
        receivedAt: message.receivedAt,
      })
      .from(mailbox)
      .innerJoin(
        message,
        eq(
          message.id,
          sql`(select m2.id from ${message} m2 where m2.mailbox_id = ${mailbox.id} order by m2.received_at desc limit 1)`,
        ),
      )
      .where(visible),
    ownedShareCounts(db, viewerId),
  ] as const;
}

type SummaryRows = Awaited<ReturnType<typeof mailboxSummaries>[0]>;
type LatestRows = Awaited<ReturnType<typeof mailboxSummaries>[1]>;

export function toMailboxList(rows: SummaryRows, latest: LatestRows, shareCounts: ShareCountRows = []) {
  const newest = new Map(latest.map(({ mailboxId, ...m }) => [mailboxId, m]));
  return rows
    .map((row) => ({ ...withSharing(accessView(row), shareCounts), latest: newest.get(row.id) ?? null }))
    .sort(
      (a, b) =>
        new Date(b.latest?.receivedAt ?? b.createdAt).getTime() - new Date(a.latest?.receivedAt ?? a.createdAt).getTime(),
    );
}
