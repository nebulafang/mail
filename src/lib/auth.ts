import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies, headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { session as sessionTable, user } from "@/db/schema";
import { forwardedIp } from "./client-ip";
import { deviceModel } from "./device";
import { getServer } from "./server";
import { sessionEnabled, USER_COOKIE, USER_SESSION_TTL, type UserSession } from "./session-cookie";
import { needsTouch, toViewer, touchSession, viewerQuery, type Viewer } from "./viewer";

const ITERATIONS = 100_000;
const encoder = new TextEncoder();
const toBase64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString("base64");

function userSessionOptions(secret: string): SessionOptions {
  return {
    cookieName: USER_COOKIE,
    password: secret,
    ttl: USER_SESSION_TTL,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
  };
}

export async function getUserSession() {
  const { env } = await getServer();
  if (!sessionEnabled(env.SESSION_SECRET)) return null;
  return getIronSession<UserSession>(await cookies(), userSessionOptions(env.SESSION_SECRET));
}

export type { Viewer };

export async function getViewer({ writable = true } = {}): Promise<Viewer | null> {
  const session = await getUserSession();
  if (!session?.userId || !session.sid) return null;
  const { db } = await getServer();
  const [row] = await viewerQuery(db, { sid: session.sid, userId: session.userId });
  if (!row || row.disabled) {
    if (writable) session.destroy();
    return null;
  }
  const now = new Date();
  if (needsTouch(row, now)) {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(touchSession(db, session.sid, row.id, now));
  }
  return toViewer(row, session.sid);
}

export async function getViewerId() {
  return (await getViewer())?.id ?? null;
}

export async function startSession(session: IronSession<UserSession>, account: { id: string; username: string }) {
  const { db } = await getServer();
  const h = await headers();
  const now = new Date();
  const [[created]] = await db.batch([
    db
      .insert(sessionTable)
      .values({
        userId: account.id,
        ip: forwardedIp(h),
        model: deviceModel(h.get("user-agent"), h.get("sec-ch-ua-model")),
        createdAt: now,
        lastSeenAt: now,
      })
      .returning({ id: sessionTable.id }),
    db.update(user).set({ lastSeenAt: now }).where(eq(user.id, account.id)),
  ]);
  session.userId = account.id;
  session.username = account.username;
  session.sid = created.id;
  await session.save();
}

export async function hashPassword(password: string, saltBase64?: string) {
  const salt = saltBase64 ? Buffer.from(saltBase64, "base64") : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return { hash: toBase64(bits), salt: toBase64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const { hash: candidate } = await hashPassword(password, salt);
  const a = Buffer.from(candidate, "base64");
  const b = Buffer.from(hash, "base64");
  return a.length === b.length && timingSafeEqual(a, b);
}

const DUMMY_SALT = toBase64(new Uint8Array(16));

export async function burnPasswordCheck(password: string) {
  await hashPassword(password, DUMMY_SALT);
}
