import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { message } from "@/db/schema";
import { findSharedMailbox, getServer, jsonError, listAttachments, shareUnavailable, withInline } from "@/lib/server";

export async function GET(_request: Request, { params }: RouteContext<"/api/share/[token]/messages/[id]">) {
  const { token, id } = await params;
  const { db } = await getServer();
  const box = await findSharedMailbox(db, token);
  if (!box) return shareUnavailable(db, token);

  const msg = await db.query.message.findFirst({ where: and(eq(message.id, id), eq(message.mailboxId, box.id)) });
  if (!msg) return jsonError("邮件不存在或已被删除", 404);

  const suffix = `?share=${encodeURIComponent(token)}`;
  const html = msg.html?.replace(/\/api\/attachments\/([A-Za-z0-9_-]+)(?=["'\s)>])/g, (url) => `${url}${suffix}`) ?? null;
  const attachments = withInline(msg.html, await listAttachments(db, msg.id));

  return NextResponse.json(
    { message: { ...msg, html, seen: true, attachments } },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
