import { and, eq, type SQL } from "drizzle-orm";
import { attachment, mailbox, message } from "../db/schema";
import { accountSummaryQuery, toAccountSummary } from "../lib/account";
import { MAX_SAVED_MAILBOXES, parseDomains } from "../lib/config";
import {
  accessibleMailbox,
  accessView,
  attachmentsOfAccessible,
  mailboxByAddress,
  mailboxSummaries,
  messagesOfAddress,
  organizableMailbox,
  ownedShareCounts,
  sharedMailboxWhere,
  toMailboxList,
  withInline,
  withSharing,
} from "../lib/mail-queries";
import { loadRegistrationOpen } from "../lib/registration";
import { checkEmail } from "../lib/rules";
import { can } from "../lib/share-rules";
import { sessionEnabled } from "../lib/session-cookie";
import type { DB } from "../db";
import { readJson } from "../lib/validation";
import { admit, database, json, jsonError, jsonRevalidated, limitRead, mailboxNotFound, noContent, NO_STORE, sessionClaim, viewerBatch, viewerQuery, type Edge } from "./core";

const MESSAGE_PAGE_MAX = 200;

const messageNotFound = () => jsonError("邮件不存在或已过期", 404);

export const ping = () => new Response(null, { status: 204, headers: NO_STORE });

export function config(e: Edge) {
  const contact = ((e.env as { CONTACT_EMAIL?: string }).CONTACT_EMAIL ?? process.env.CONTACT_EMAIL)?.trim() || undefined;
  return json({ domains: parseDomains(e.env.MAIL_DOMAINS), contact }, { headers: { "Cache-Control": "public, max-age=300" } });
}

export async function availability(e: Edge) {
  const checked = checkEmail(e.url.searchParams.get("address") ?? "");
  if (checked.error !== undefined) return jsonError(checked.error, 400);
  const address = checked.value;
  if (!parseDomains(e.env.MAIL_DOMAINS).includes(address.split("@")[1])) return jsonError("不支持的域名", 400);
  const limited = await limitRead(e);
  if (limited) return limited;

  const db = await database(e);
  const [found] = await db
    .select({ ownerId: mailbox.ownerId, catchAll: mailbox.catchAll, expiresAt: mailbox.expiresAt })
    .from(mailbox)
    .where(eq(mailbox.address, address))
    .limit(1);
  const alive = !!found && found.expiresAt.getTime() > Date.now();
  const status = !alive || found.catchAll ? "free" : found.ownerId ? "taken" : "shared";
  return json({ status }, { headers: NO_STORE });
}

export async function authSession(e: Edge) {
  if (!sessionEnabled(e.env.SESSION_SECRET)) return json({ enabled: false, user: null });
  const claim = await sessionClaim(e);
  if (!claim) return json({ enabled: true, user: null, registration: await loadRegistrationOpen(await database(e)) });
  const db = await database(e);
  const [rows, counts] = await db.batch([viewerQuery(db, claim), accountSummaryQuery(db, claim.userId)]);
  const viewer = admit(e, db, claim, rows);
  return json({ enabled: true, user: viewer ? toAccountSummary(viewer.username, counts) : null });
}

export async function listMailboxes(e: Edge) {
  const addresses = e.url.searchParams
    .getAll("address")
    .map((a) => a.toLowerCase())
    .slice(0, MAX_SAVED_MAILBOXES);
  const limited = addresses.length ? await limitRead(e) : null;
  if (limited) return limited;
  const { results } = await viewerBatch(e, (db, viewerId) => (addresses.length || viewerId ? mailboxSummaries(db, addresses, viewerId) : null));
  return jsonRevalidated(e, { mailboxes: results ? toMailboxList(results[0], results[1], results[2]) : [] });
}

export async function getMailbox(e: Edge, [address]: string[]) {
  const limited = await limitRead(e);
  if (limited) return limited;
  const { results } = await viewerBatch(
    e,
    (db, viewerId) => [mailboxByAddress(db, address, viewerId), ownedShareCounts(db, viewerId, address)] as const,
  );
  const box = results?.[0][0];
  return box ? json({ mailbox: withSharing(accessView(box), results[1]) }) : mailboxNotFound();
}

export async function listMessages(e: Edge, [address]: string[]) {
  const limited = await limitRead(e);
  if (limited) return limited;
  const asked = Number(e.url.searchParams.get("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, MESSAGE_PAGE_MAX) : MESSAGE_PAGE_MAX;
  const { results } = await viewerBatch(
    e,
    (db, viewerId) => [mailboxByAddress(db, address, viewerId), messagesOfAddress(db, address, viewerId, limit + 1)] as const,
  );
  if (!results?.[0][0]) return mailboxNotFound();
  const rows = results[1];
  return jsonRevalidated(e, { messages: rows.slice(0, limit), hasMore: rows.length > limit });
}

export async function getMessage(e: Edge, [id]: string[]) {
  const { results } = await viewerBatch(
    e,
    (db, viewerId) =>
      [
        db
          .select({
            id: message.id,
            mailboxId: message.mailboxId,
            fromAddress: message.fromAddress,
            fromName: message.fromName,
            subject: message.subject,
            text: message.text,
            html: message.html,
            code: message.code,
            size: message.size,
            seen: message.seen,
            headers: message.headers,
            receivedAt: message.receivedAt,
          })
          .from(message)
          .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
          .where(and(eq(message.id, id), accessibleMailbox(viewerId))),
        attachmentsOfAccessible(db, id, viewerId),
      ] as const,
  );
  const msg = results?.[0][0];
  if (!msg) return messageNotFound();
  return json({ message: { ...msg, attachments: withInline(msg.html, results[1]) } });
}

export async function markMessage(e: Edge, [id]: string[]) {
  const body = (await readJson(e.request)) as { seen?: unknown } | null;
  if (typeof body?.seen !== "boolean") return jsonError("参数错误", 400);
  const found = await organizableMessage(e, id);
  if (!found) return messageNotFound();
  const db = await database(e);
  await db.update(message).set({ seen: body.seen }).where(eq(message.id, found.id));
  return noContent();
}

const attachmentFileColumns = { filename: attachment.filename, mimeType: attachment.mimeType, content: attachment.content };

const visibleAttachment = (db: DB, id: string, mailboxWhere: SQL | undefined) =>
  db
    .select(attachmentFileColumns)
    .from(attachment)
    .innerJoin(mailbox, eq(mailbox.id, attachment.mailboxId))
    .innerJoin(message, eq(message.id, attachment.messageId))
    .where(and(eq(attachment.id, id), mailboxWhere));

export async function getAttachment(e: Edge, [id]: string[]) {
  const share = e.url.searchParams.get("share");
  let found: { filename: string; mimeType: string; content: string | null } | undefined;
  if (share) {
    const db = await database(e);
    [found] = await visibleAttachment(db, id, sharedMailboxWhere(share));
  } else {
    const { results } = await viewerBatch(e, (db, viewerId) => [visibleAttachment(db, id, accessibleMailbox(viewerId))] as const);
    found = results?.[0][0];
  }
  if (!found?.content) return jsonError("附件不存在或已过期", 404);

  const body = Buffer.from(found.content, "base64");
  const disposition = e.url.searchParams.has("download") ? "attachment" : "inline";
  return new Response(body, {
    headers: {
      "Content-Type": found.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(found.filename)}`,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function findForDeletion(e: Edge, address: string) {
  const { results } = await viewerBatch(e, (db, viewerId) => [mailboxByAddress(db, address, viewerId)] as const);
  return { box: results?.[0][0], db: await database(e) };
}

async function organizableMessage(e: Edge, id: string) {
  const { results } = await viewerBatch(
    e,
    (db, viewerId) =>
      [
        db
          .select({ id: message.id })
          .from(message)
          .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
          .where(and(eq(message.id, id), organizableMailbox(viewerId))),
      ] as const,
  );
  return results?.[0][0];
}

export async function deleteMessage(e: Edge, [id]: string[]) {
  const found = await organizableMessage(e, id);
  if (!found) return messageNotFound();
  const db = await database(e);
  await db.delete(message).where(eq(message.id, found.id));
  return noContent();
}

export async function clearMailbox(e: Edge, [address]: string[]) {
  const { box, db } = await findForDeletion(e, address);
  if (!box) return mailboxNotFound();
  if (!can(box.role, "organize")) return jsonError("你在这个共享邮箱里是只读权限", 403);
  await db.delete(message).where(eq(message.mailboxId, box.id));
  return noContent();
}

export async function deleteMailbox(e: Edge, [address]: string[]) {
  const { box, db } = await findForDeletion(e, address);
  if (!box) return mailboxNotFound();
  if (!can(box.role, "delete")) return jsonError("共享来的邮箱不能删除，可以选择退出共享", 403);
  await db.delete(mailbox).where(eq(mailbox.id, box.id));
  return noContent();
}
