import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { getDb, type DB } from "../db";
import { ensureSchema } from "../db/migrate";
import { clientIp as requestIp } from "../lib/client-ip";
import { toHex } from "../lib/hex";
import { readSessionClaim, USER_COOKIE, type SessionClaim } from "../lib/session-cookie";
import { needsTouch, toViewer, touchSession, viewerQuery, type Viewer, type ViewerRow } from "../lib/viewer";
import { disconnectUser, notifyShare } from "../realtime/notify";

export type Edge = {
  request: Request;
  url: URL;
  env: CloudflareEnv;
  ctx: Pick<ExecutionContext, "waitUntil">;
  clearSession: boolean;
};

export type { Viewer };

type Query = BatchItem<"sqlite">;

const encoder = new TextEncoder();

export async function database(e: Pick<Edge, "env">): Promise<DB> {
  await ensureSchema(e.env.DB);
  return getDb(e.env.DB);
}

const cookieHeader = (e: Edge) => e.request.headers.get("cookie");

export const sessionClaim = (e: Edge) => readSessionClaim(cookieHeader(e), e.env.SESSION_SECRET);

export { viewerQuery };

export function admit(e: Pick<Edge, "ctx"> & { clearSession?: boolean }, db: DB, claim: SessionClaim, rows: ViewerRow[]): Viewer | null {
  const row = rows[0];
  if (!row || row.disabled) {
    e.clearSession = true;
    return null;
  }
  const now = new Date();
  if (needsTouch(row, now)) e.ctx.waitUntil(touchSession(db, claim.sid, row.id, now).catch(() => {}));
  return toViewer(row, claim.sid);
}

export async function viewerBatch<T extends readonly [Query, ...Query[]]>(
  e: Edge,
  build: (db: DB, viewerId: string | null) => T | null,
): Promise<{ viewer: Viewer | null; results: BatchResponse<T> | null }> {
  const db = await database(e);
  const claim = await sessionClaim(e);
  const claimed = claim && build(db, claim.userId);
  if (claim && claimed) {
    const [rows, ...results] = await db.batch([viewerQuery(db, claim), ...claimed]);
    const viewer = admit(e, db, claim, rows);
    if (viewer) return { viewer, results: results as unknown as BatchResponse<T> };
  } else if (claim) {
    const viewer = admit(e, db, claim, await viewerQuery(db, claim));
    if (viewer) return { viewer, results: null };
  }
  const anonymous = build(db, null);
  return { viewer: null, results: anonymous && ((await db.batch(anonymous)) as BatchResponse<T>) };
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

export const jsonError = (message: string, status: number) => json({ error: message }, { status });

export const noContent = () => new Response(null, { status: 204 });

export const NO_STORE = { "Cache-Control": "no-store" };

export const mailboxNotFound = () => jsonError("邮箱不存在或已过期", 404);

export const millis = (date: Date | null) => date?.getTime() ?? null;

export function notify(e: Edge, userIds: (string | null)[], address: string, reconnect = false) {
  const ids = userIds.filter((id): id is string => !!id);
  if (ids.length) e.ctx.waitUntil(notifyShare(e.env, ids, address, reconnect).catch(() => {}));
}

export function dropLive(e: Pick<Edge, "env" | "ctx">, userId: string) {
  e.ctx.waitUntil(disconnectUser(e.env, userId).catch(() => {}));
}

export async function jsonRevalidated(e: Edge, data: unknown) {
  const body = JSON.stringify(data);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", encoder.encode(body)));
  const etag = `W/"${toHex(digest.subarray(0, 12))}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (e.request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { "Content-Type": "application/json", ...headers } });
}

export const clientIp = (e: Edge) => requestIp(e.request);

export async function limitRead(e: Edge) {
  const { success } = await e.env.READ_LIMITER.limit({ key: `read:${clientIp(e)}` });
  return success ? null : jsonError("请求太频繁，请稍后再试", 429);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function crossSite(request: Request, url: URL) {
  if (SAFE_METHODS.has(request.method)) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  return !URL.canParse(origin) || new URL(origin).host !== url.host;
}

export function expireSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${USER_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
