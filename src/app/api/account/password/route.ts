import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { session as sessionTable, user } from "@/db/schema";
import { getViewer, hashPassword, verifyPassword } from "@/lib/auth";
import { limitAuth } from "@/lib/auth-server";
import { dropLiveSockets, getServer, jsonError } from "@/lib/server";
import { changePasswordSchema, firstIssue, readJson } from "@/lib/validation";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return jsonError("请先登录", 401);
  const limited = await limitAuth(request);
  if (limited) return limited;

  const parsed = changePasswordSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const { current, next } = parsed.data;
  if (current === next) return jsonError("新密码不能和当前密码相同", 400);

  const { db } = await getServer();
  const found = await db.query.user.findFirst({ where: eq(user.id, viewer.id) });
  if (!found || !(await verifyPassword(current, found.passwordHash, found.passwordSalt))) {
    return jsonError("当前密码不正确", 401);
  }
  const { hash, salt } = await hashPassword(next);
  const [, revoked] = await db.batch([
    db.update(user).set({ passwordHash: hash, passwordSalt: salt }).where(eq(user.id, viewer.id)),
    db
      .delete(sessionTable)
      .where(and(eq(sessionTable.userId, viewer.id), ne(sessionTable.id, viewer.sid)))
      .returning({ id: sessionTable.id }),
  ]);
  if (revoked.length) await dropLiveSockets(viewer.id);
  return NextResponse.json({ revoked: revoked.length });
}
