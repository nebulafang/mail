import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { user } from "@/db/schema";
import { accountSummary } from "@/lib/account";
import { getUserSession, getViewer, verifyPassword } from "@/lib/auth";
import { limitAuth } from "@/lib/auth-server";
import { dropLiveSockets, getServer, jsonError } from "@/lib/server";
import { deleteAccountSchema, readJson } from "@/lib/validation";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return jsonError("请先登录", 401);
  const { db } = await getServer();
  const summary = await accountSummary(db, viewer.id, viewer.username);
  return NextResponse.json({ account: { ...summary, createdAt: viewer.createdAt } });
}

export async function DELETE(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError("请先登录", 401);
  const limited = await limitAuth(request);
  if (limited) return limited;
  const parsed = deleteAccountSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError("请输入密码", 400);

  const { db } = await getServer();
  const found = await db.query.user.findFirst({ where: eq(user.id, viewer.id) });
  if (!found || !(await verifyPassword(parsed.data.password, found.passwordHash, found.passwordSalt))) {
    return jsonError("密码错误", 401);
  }
  await db.delete(user).where(eq(user.id, viewer.id));
  (await getUserSession())?.destroy();
  await dropLiveSockets(viewer.id);
  return new NextResponse(null, { status: 204 });
}
