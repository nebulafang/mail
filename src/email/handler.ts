import { and, eq, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import PostalMime from "postal-mime";
import { createDb, type DB } from "../db";
import { attachment, mailbox, mailboxMember, message, type MailHeader } from "../db/schema";
import { adminPassword } from "../lib/admin-session";
import { forwardCopy, forwardTarget } from "../lib/forward";
import { extractCode } from "../lib/otp";
import { htmlToText } from "./html-text";
import { CATCH_ALL_TTL_MS, MAX_EMAIL_SIZE } from "../lib/config";
import { aliveMailbox, memberNotExpired, PREVIEW_CHARS } from "../lib/mail-queries";
import { INGEST_POLICY, loadStoragePressure } from "../lib/quota";
import { broadcast, shareTag, userTag } from "../realtime/mail-hub";

const KEPT_HEADERS = new Set([
  "message-id",
  "date",
  "reply-to",
  "return-path",
  "sender",
  "list-unsubscribe",
  "list-id",
  "x-mailer",
  "authentication-results",
  "arc-authentication-results",
  "received-spf",
  "dkim-signature",
  "received",
  "content-type",
  "mime-version",
  "x-spam-status",
]);

function pickHeaders(headers: { key: string; value: string }[]): MailHeader[] {
  let received = 0;
  const out: MailHeader[] = [];
  for (const { key, value } of headers) {
    const k = key.toLowerCase();
    if (!KEPT_HEADERS.has(k)) continue;
    if (k === "received" && ++received > 4) continue;
    out.push({ key: k, value: value.slice(0, k === "dkim-signature" ? 200 : 1000) });
  }
  return out;
}

async function activeMailbox(db: DB, address: string, now: Date) {
  const [found] = await db
    .select({ id: mailbox.id, ownerId: mailbox.ownerId, shareToken: mailbox.shareToken, shareExpiresAt: mailbox.shareExpiresAt })
    .from(mailbox)
    .where(and(eq(mailbox.address, address), aliveMailbox(now)))
    .limit(1);
  return found;
}

async function catchAllMailbox(db: DB, address: string, now: Date) {
  const expiresAt = new Date(now.getTime() + CATCH_ALL_TTL_MS);
  const [, [row]] = await db.batch([
    db.delete(mailbox).where(and(eq(mailbox.address, address), lte(mailbox.expiresAt, now))),
    db
      .insert(mailbox)
      .values({ address, catchAll: true, expiresAt, createdAt: now })
      .onConflictDoUpdate({
        target: mailbox.address,
        set: { expiresAt: sql`case when ${mailbox.catchAll} then ${expiresAt.getTime()} else ${mailbox.expiresAt} end` },
      })
      .returning({ id: mailbox.id, catchAll: mailbox.catchAll }),
  ]);
  return row?.catchAll ? row.id : null;
}

export async function handleEmail(email: ForwardableEmailMessage, env: CloudflareEnv, ctx: ExecutionContext) {
  const db = createDb(env.DB);
  const to = email.to.toLowerCase();

  if (email.rawSize > MAX_EMAIL_SIZE) {
    email.setReject("Message too large");
    return;
  }

  const now = new Date();
  const target = forwardTarget(env);
  const [box, pressure] = await Promise.all([activeMailbox(db, to, now), loadStoragePressure(db)]);
  const catchAllId = !box && adminPassword(env) && pressure !== "hard" ? await catchAllMailbox(db, to, now) : null;
  const mailboxId = box?.id ?? catchAllId;
  if (!mailboxId) {
    if (target) await forwardCopy(email, target, to);
    return;
  }

  const parsed = await PostalMime.parse(email.raw);
  const policy = INGEST_POLICY[pressure];
  const messageId = nanoid();
  let html = parsed.html ?? null;

  const attachmentRows = parsed.attachments.map((a) => {
    const id = nanoid();
    const size = typeof a.content === "string" ? a.content.length : a.content.byteLength;

    const cid = a.contentId?.replace(/^<|>$/g, "");
    const inline = !!cid && !!html?.includes(`cid:${cid}`);
    if (inline && html) html = html.replaceAll(`cid:${cid}`, `/api/attachments/${id}`);

    return {
      id,
      messageId,
      mailboxId,
      filename: a.filename || `attachment-${id}`,
      mimeType: a.mimeType,
      size,
      content: null,
    };
  });

  const text = parsed.text || (parsed.html ? htmlToText(parsed.html) : null);

  const sender = parsed.from && !parsed.from.group ? parsed.from : undefined;
  const body = text?.slice(0, policy.bodyChars) ?? null;
  const preview = (body ?? "").slice(0, PREVIEW_CHARS);
  const item = {
    id: messageId,
    fromAddress: sender?.address || email.from,
    fromName: sender?.name || null,
    subject: parsed.subject ?? "",
    code: extractCode(parsed.subject, text),
  };

  await db.batch([
    db.insert(message).values({
      ...item,
      mailboxId,
      text: body,
      preview,
      html: policy.keepHtml ? (html?.slice(0, policy.bodyChars) ?? null) : null,
      headers: pickHeaders(parsed.headers),
      size: email.rawSize,
      receivedAt: now,
    }),
    ...attachmentRows.map((row) => db.insert(attachment).values(row)),
  ]);

  if (!box) {
    if (target) await forwardCopy(email, target, to);
    return;
  }

  const payload = { address: to, message: { ...item, preview, seen: false, receivedAt: now.toISOString() } };
  const ownerId = box.ownerId;
  const shareLive = !!box.shareToken && (!box.shareExpiresAt || box.shareExpiresAt > now);
  const audience = async () =>
    ownerId
      ? [
          userTag(ownerId),
          ...(shareLive && box.shareToken ? [shareTag(box.shareToken)] : []),
          ...(
            await db
              .select({ userId: mailboxMember.userId })
              .from(mailboxMember)
              .where(
                and(
                  eq(mailboxMember.mailboxId, box.id),
                  eq(mailboxMember.status, "active"),
                  memberNotExpired(now),
                ),
              )
          ).map((m) => userTag(m.userId)),
        ]
      : [to];
  ctx.waitUntil(
    audience()
      .then((tags) => broadcast(env, tags, payload))
      .catch(() => {}),
  );

  if (target) await forwardCopy(email, target, to);
}
