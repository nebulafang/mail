import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getDb, type DB } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { disconnectUser } from "@/realtime/notify";
import { attachmentsOf, expiredShareQuery, mailboxByAddress, sharedMailboxWhere } from "./mail-queries";

export { accessibleMailbox, accessView, organizableMailbox, withInline } from "./mail-queries";

export async function getServer() {
  const { env } = await getCloudflareContext({ async: true });
  await ensureSchema(env.DB);
  return { env, db: getDb(env.DB) };
}

export async function dropLiveSockets(userId: string) {
  const { env, ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(disconnectUser(env, userId).catch(() => {}));
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const notFound = () => jsonError("邮箱不存在或已过期", 404);

export async function findMailbox(db: DB, address: string, viewerId: string | null) {
  const [box] = await mailboxByAddress(db, address, viewerId);
  return box;
}

export function findSharedMailbox(db: DB, token: string) {
  return db.query.mailbox.findFirst({ where: sharedMailboxWhere(token) });
}

export const shareNotFound = () => jsonError("分享链接已失效，请向邮箱主人索取新的链接", 404);

export async function shareUnavailable(db: DB, token: string) {
  const [expired] = await expiredShareQuery(db, token);
  if (!expired?.expiredAt) return shareNotFound();
  return NextResponse.json(
    { error: "这个分享链接已过期，请向邮箱主人索取新的链接", reason: "expired", expiredAt: expired.expiredAt },
    { status: 410, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}

export const listAttachments = attachmentsOf;


