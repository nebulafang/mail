import { and, count, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mailbox, mailboxMember, message } from "@/db/schema";
import { randomLocalPart } from "@/lib/address";
import { edgeRoute } from "@/edge/next";
import { getViewer } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { expiryToDate, MAX_ACCOUNT_MAILBOXES, parseDomains } from "@/lib/config";
import { countWhen } from "@/lib/mail-queries";
import { getServer, jsonError } from "@/lib/server";
import { createMailboxSchema, firstIssue, readJson } from "@/lib/validation";

export const GET = edgeRoute;

export async function POST(request: Request) {
  const { env, db } = await getServer();

  const { success } = await env.CREATE_LIMITER.limit({ key: clientIp(request) });
  if (!success) return jsonError("创建太频繁，请稍后再试", 429);

  const parsed = createMailboxSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const { domain, localPart, expiry } = parsed.data;
  const viewer = await getViewer();
  const viewerId = viewer?.id ?? null;
  if (viewerId) {
    const [{ owned }] = await db.select({ owned: count() }).from(mailbox).where(eq(mailbox.ownerId, viewerId));
    if (owned >= MAX_ACCOUNT_MAILBOXES) return jsonError(`每个账号最多 ${MAX_ACCOUNT_MAILBOXES} 个邮箱，请先删除不用的`, 403);
  }

  if (!parseDomains(env.MAIL_DOMAINS).includes(domain)) return jsonError("不支持的域名", 400);

  const expiresAt = expiryToDate(expiry);
  const toView = ({ ownerId, ...box }: typeof mailbox.$inferSelect) => ({
    ...box,
    owned: !!ownerId,
    total: 0,
    unread: 0,
    latest: null,
  });

  if (!localPart) {
    for (let i = 0; i < 5; i++) {
      const [created] = await db
        .insert(mailbox)
        .values({ address: `${randomLocalPart()}@${domain}`, expiresAt, ownerId: viewerId })
        .onConflictDoNothing({ target: mailbox.address })
        .returning();
      if (created) {
        return NextResponse.json({ mailbox: toView(created) }, { status: 201 });
      }
    }
    return jsonError("生成地址失败，请重试", 409);
  }

  const address = `${localPart}@${domain}`;
  const [created] = await db
    .insert(mailbox)
    .values({ address, expiresAt, ownerId: viewerId })
    .onConflictDoNothing({ target: mailbox.address })
    .returning();
  if (created) {
    return NextResponse.json({ mailbox: toView(created) }, { status: 201 });
  }

  const now = new Date();
  const [taken] = await db
    .update(mailbox)
    .set({ catchAll: false, expiresAt, ownerId: viewerId, note: null, shareToken: null, shareExpiresAt: null, createdAt: now })
    .where(
      and(
        eq(mailbox.address, address),
        or(eq(mailbox.catchAll, true), lte(mailbox.expiresAt, now)),
        or(isNull(mailbox.ownerId), lte(mailbox.expiresAt, now)),
      ),
    )
    .returning();
  if (taken) {
    await db.batch([
      db.delete(message).where(and(eq(message.mailboxId, taken.id), lte(message.receivedAt, now))),
      db.delete(mailboxMember).where(eq(mailboxMember.mailboxId, taken.id)),
    ]);
    return NextResponse.json({ mailbox: toView(taken) }, { status: 201 });
  }

  const [shared] = await db
    .select({
      id: mailbox.id,
      address: mailbox.address,
      expiresAt: mailbox.expiresAt,
      createdAt: mailbox.createdAt,
      catchAll: mailbox.catchAll,
      note: mailbox.note,
      total: count(message.id),
      unread: countWhen(sql`${message.seen} = 0`),
    })
    .from(mailbox)
    .leftJoin(message, eq(message.mailboxId, mailbox.id))
    .where(and(eq(mailbox.address, address), isNull(mailbox.ownerId), eq(mailbox.catchAll, false), gt(mailbox.expiresAt, now)))
    .groupBy(mailbox.id);
  if (shared) {
    return NextResponse.json({ mailbox: { ...shared, note: null, owned: false, latest: null, shared: true } });
  }
  return jsonError("这个地址已被其他账号占用", 409);
}
