import { NextResponse } from "next/server";
import { user } from "@/db/schema";
import { getUserSession, hashPassword, startSession } from "@/lib/auth";
import { limitAuth } from "@/lib/auth-server";
import { loadRegistrationOpen } from "@/lib/registration";
import { getServer, jsonError } from "@/lib/server";
import { firstIssue, readJson, registerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getUserSession();
  if (!session) return jsonError("注册功能未启用", 503);
  const limited = await limitAuth(request);
  if (limited) return limited;

  const parsed = registerSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const { username, password } = parsed.data;

  const { db } = await getServer();
  if (!(await loadRegistrationOpen(db))) return jsonError("注册已关闭，请联系管理员", 403);
  const { hash, salt } = await hashPassword(password);
  const [created] = await db
    .insert(user)
    .values({ username, passwordHash: hash, passwordSalt: salt })
    .onConflictDoNothing({ target: user.username })
    .returning({ id: user.id, username: user.username });
  if (!created) return jsonError("这个用户名已被注册", 409);

  await startSession(session, created);
  return NextResponse.json({ user: { username: created.username, mailboxes: 0, permanent: 0 } }, { status: 201 });
}
