import { unsealData } from "iron-session";

export type UserSession = { userId?: string; username?: string; sid?: string };
export type SessionClaim = { userId: string; sid: string };

export const USER_COOKIE = "user_session";
export const USER_SESSION_TTL = 30 * 24 * 60 * 60;
const MIN_SECRET = 32;

export const sessionEnabled = (secret: string | undefined): secret is string => !!secret && secret.length >= MIN_SECRET;

export function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) return entry.slice(prefix.length);
  }
  return undefined;
}

export async function readSessionClaim(cookieHeader: string | null, secret: string | undefined): Promise<SessionClaim | null> {
  if (!sessionEnabled(secret)) return null;
  const sealed = readCookie(cookieHeader, USER_COOKIE);
  if (!sealed) return null;
  try {
    const data = await unsealData<UserSession>(decodeURIComponent(sealed), { password: secret, ttl: USER_SESSION_TTL });
    return data.userId && data.sid ? { userId: data.userId, sid: data.sid } : null;
  } catch {
    return null;
  }
}

export async function readUserId(cookieHeader: string | null, secret: string | undefined, db: D1Database) {
  const claim = await readSessionClaim(cookieHeader, secret);
  if (!claim) return null;
  try {
    const row = await db
      .prepare("select s.user_id from session s join user u on u.id = s.user_id where s.id = ? and s.user_id = ? and u.disabled = 0")
      .bind(claim.sid, claim.userId)
      .first<{ user_id: string }>();
    return row?.user_id ?? null;
  } catch {
    return null;
  }
}
