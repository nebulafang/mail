import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { mailbox } from "@/db/schema";
import { expiryToDate } from "@/lib/config";
import { edgeRoute } from "@/edge/next";
import { getViewerId } from "@/lib/auth";
import { accessView, findMailbox, getServer, jsonError, notFound } from "@/lib/server";
import { can } from "@/lib/share-rules";
import { firstIssue, readJson, updateMailboxSchema } from "@/lib/validation";

export const GET = edgeRoute;

export async function PATCH(request: Request, { params }: RouteContext<"/api/mailboxes/[address]">) {
  const { db } = await getServer();
  const viewerId = await getViewerId();
  const box = await findMailbox(db, (await params).address, viewerId);
  if (!box) return notFound();

  const parsed = updateMailboxSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const { expiry, note } = parsed.data;
  if (expiry === "permanent" && !can(box.role, "permanent")) return jsonError("登录并把邮箱加入账号后，才能设为永久", 403);
  if (expiry && expiry !== "permanent" && !can(box.role, "renew")) return jsonError("你没有修改这个共享邮箱有效期的权限", 403);
  if (note !== undefined && !can(box.role, "note"))
    return jsonError(box.role ? "你没有修改这个共享邮箱备注的权限" : "只有账号里的邮箱可以在服务器保存备注", 403);

  const [updated] = await db
    .update(mailbox)
    .set({
      ...(expiry && { expiresAt: expiryToDate(expiry) }),
      ...(note !== undefined && { note: note || null }),
    })
    .where(eq(mailbox.id, box.id))
    .returning();
  return NextResponse.json({ mailbox: accessView({ ...updated, role: box.role, ownerName: box.ownerName }) });
}

export const DELETE = edgeRoute;
