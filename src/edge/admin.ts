import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { DB } from "../db";
import { appSetting, mailbox, message, session, user } from "../db/schema";
import { adminPassword, adminSessionCookie, hasAdminSession, matchesAdminPassword, sealAdminSession } from "../lib/admin-session";
import { PERMANENT_AT } from "../lib/config";
import { cursorKey, pageOf, parseCursor, type PageCursor } from "../lib/cursor";
import { attachmentsOf, normalizeAddress, withInline } from "../lib/mail-queries";
import { databaseSize, pressureOf, quotaLimits } from "../lib/quota";
import { loadRegistrationOpen, saveRegistrationOpen } from "../lib/registration";
import { DAY_MS } from "../lib/time";
import { readJson } from "../lib/validation";
import { clientIp, database, dropLive, json, jsonError, noContent, NO_STORE, type Edge } from "./core";

const USER_PAGE = 40;
const MESSAGE_PAGE = 50;
const MAX_QUERY = 64;

type AdminHandler = (e: Edge, params: string[], db: DB) => Promise<Response>;

const adminOnly = (handler: AdminHandler) => async (e: Edge, params: string[]) =>
  (await hasAdminSession(e.request.headers.get("cookie"), adminPassword(e.env)))
    ? handler(e, params, await database(e))
    : jsonError("请先登录管理后台", 401);

const qualified = (table: string, column: string) => sql`${sql.identifier(table)}.${sql.identifier(column)}`;

const before = (at: SQLiteColumn, id: SQLiteColumn, cursor: PageCursor | null) =>
  cursor ? or(lt(at, cursor.at), and(eq(at, cursor.at), lt(id, cursor.id))) : undefined;

const searchTerm = (e: Edge) => e.url.searchParams.get("q")?.trim().toLowerCase().slice(0, MAX_QUERY) || null;

const contains = (column: SQLiteColumn, term: string) => sql`instr(lower(${column}), ${term}) > 0`;

const withSetCookie = (response: Response, cookie: string) => {
  response.headers.append("Set-Cookie", cookie);
  return response;
};

export async function adminSession(e: Edge) {
  const password = adminPassword(e.env);
  const admin = await hasAdminSession(e.request.headers.get("cookie"), password);
  return json({ enabled: !!password, admin }, { headers: NO_STORE });
}

export async function adminLogin(e: Edge) {
  const password = adminPassword(e.env);
  if (!password) return jsonError("管理后台未启用：请先配置 ADMIN_PASSWORD", 503);
  const { success } = await e.env.AUTH_LIMITER.limit({ key: `admin:${clientIp(e)}` });
  if (!success) return jsonError("尝试次数太多，请一分钟后再试", 429);
  const body = (await readJson(e.request)) as { password?: unknown } | null;
  const input = typeof body?.password === "string" ? body.password.slice(0, 256) : "";
  if (!input || !(await matchesAdminPassword(input, password))) return jsonError("密码错误", 401);
  return withSetCookie(json({ enabled: true, admin: true }, { headers: NO_STORE }), adminSessionCookie(await sealAdminSession(password)));
}

export function adminLogout() {
  return withSetCookie(noContent(), adminSessionCookie(null));
}

const countIf = (condition: SQL) => sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(Number);
const total = sql<number>`count(*)`.mapWith(Number);

const STATS_KEY = "admin_stats";
const STATS_TTL_MS = 10 * 60 * 1000;

type StatsCounts = Awaited<ReturnType<typeof countStats>>;
type CachedStats = { countedAt: number; counts: StatsCounts };

async function countStats(db: DB, now: number) {
  const dayAgo = new Date(now - DAY_MS);
  const weekAgo = new Date(now - 7 * DAY_MS);
  const [[users], [mailboxes], [messages]] = await Promise.all([
    db
      .select({
        total,
        active: countIf(sql`${user.lastSeenAt} >= ${weekAgo.getTime()}`),
        disabled: countIf(sql`${user.disabled} = 1`),
        recent: countIf(sql`${user.createdAt} >= ${dayAgo.getTime()}`),
      })
      .from(user),
    db
      .select({
        total,
        owned: countIf(sql`${mailbox.ownerId} is not null`),
        permanent: countIf(sql`${mailbox.expiresAt} >= ${PERMANENT_AT}`),
        catchAll: countIf(sql`${mailbox.catchAll} = 1`),
      })
      .from(mailbox),
    db
      .select({ total, recent: countIf(sql`${message.receivedAt} >= ${dayAgo.getTime()}`) })
      .from(message),
  ]);
  return { users, mailboxes, messages };
}

async function cachedStats(db: DB, now: number, fresh: boolean): Promise<CachedStats> {
  if (!fresh) {
    const [row] = await db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, STATS_KEY)).limit(1);
    const cached = row?.value as CachedStats | undefined;
    if (cached?.counts && now - cached.countedAt < STATS_TTL_MS) return cached;
  }
  const value: CachedStats = { countedAt: now, counts: await countStats(db, now) };
  await db
    .insert(appSetting)
    .values({ key: STATS_KEY, value, updatedAt: new Date(now) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: new Date(now) } });
  return value;
}

export const getStats = adminOnly(async (e, _params, db) => {
  const fresh = new URL(e.request.url).searchParams.has("fresh");
  const [{ countedAt, counts }, size] = await Promise.all([cachedStats(db, Date.now(), fresh), databaseSize(e.env.DB)]);
  const limits = quotaLimits(e.env);
  return json(
    {
      ...counts,
      countedAt: new Date(countedAt).toISOString(),
      storage: { size, softLimit: limits.softBytes, hardLimit: limits.hardBytes, level: pressureOf(size, limits) },
    },
    { headers: NO_STORE },
  );
});

export const getSettings = adminOnly(async (_e, _params, db) =>
  json({ registrationOpen: await loadRegistrationOpen(db) }, { headers: NO_STORE }),
);

export const updateSettings = adminOnly(async (e, _params, db) => {
  const body = (await readJson(e.request)) as { registrationOpen?: unknown } | null;
  if (typeof body?.registrationOpen !== "boolean") return jsonError("参数错误", 400);
  await saveRegistrationOpen(db, body.registrationOpen);
  return json({ registrationOpen: body.registrationOpen }, { headers: NO_STORE });
});

const mailboxCount = sql<number>`(select count(*) from ${sql.identifier("mailbox")} where ${qualified("mailbox", "owner_id")} = ${qualified("user", "id")})`;

export const listUsers = adminOnly(async (e, _params, db) => {
  const params = e.url.searchParams;
  const q = searchTerm(e);
  const status = params.get("status");
  const rows = await db
    .select({
      id: user.id,
      username: user.username,
      disabled: user.disabled,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      mailboxes: mailboxCount,
    })
    .from(user)
    .where(
      and(
        before(user.createdAt, user.id, parseCursor(params.get("cursor"))),
        q ? contains(user.username, q) : undefined,
        status === "disabled" ? eq(user.disabled, true) : status === "active" ? eq(user.disabled, false) : undefined,
      ),
    )
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(USER_PAGE + 1);
  const { page, nextCursor } = pageOf(rows, USER_PAGE, (r) => cursorKey(r.createdAt, r.id));
  return json({ users: page, nextCursor }, { headers: NO_STORE });
});

const messageCount = sql<number>`(select count(*) from ${sql.identifier("message")} where ${qualified("message", "mailbox_id")} = ${qualified("mailbox", "id")})`;

export const getUser = adminOnly(async (_e, [id], db) => {
  const [found, mailboxes, sessions] = await db.batch([
    db
      .select({ id: user.id, username: user.username, disabled: user.disabled, createdAt: user.createdAt, lastSeenAt: user.lastSeenAt })
      .from(user)
      .where(eq(user.id, id)),
    db
      .select({
        id: mailbox.id,
        address: mailbox.address,
        note: mailbox.note,
        expiresAt: mailbox.expiresAt,
        createdAt: mailbox.createdAt,
        total: messageCount,
      })
      .from(mailbox)
      .where(eq(mailbox.ownerId, id))
      .orderBy(desc(mailbox.createdAt)),
    db
      .select({ id: session.id, ip: session.ip, model: session.model, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt })
      .from(session)
      .where(eq(session.userId, id))
      .orderBy(desc(session.lastSeenAt)),
  ]);
  if (!found[0]) return jsonError("用户不存在", 404);
  return json({ user: { ...found[0], sessions, mailboxes } }, { headers: NO_STORE });
});

export const updateUser = adminOnly(async (e, [id], db) => {
  const body = (await readJson(e.request)) as { disabled?: unknown } | null;
  if (typeof body?.disabled !== "boolean") return jsonError("参数错误", 400);
  const disabled = body.disabled;
  const [updated] = await db.update(user).set({ disabled }).where(eq(user.id, id)).returning({ id: user.id, disabled: user.disabled });
  if (!updated) return jsonError("用户不存在", 404);
  if (disabled) {
    await db.delete(session).where(eq(session.userId, id));
    dropLive(e, id);
  }
  return json({ user: updated });
});

export const revokeUserSession = adminOnly(async (e, [id, sid], db) => {
  const [removed] = await db
    .delete(session)
    .where(and(eq(session.id, sid), eq(session.userId, id)))
    .returning({ id: session.id });
  if (!removed) return jsonError("这台设备已经退出", 404);
  dropLive(e, id);
  return noContent();
});

export const deleteUser = adminOnly(async (e, [id], db) => {
  const [removed] = await db.delete(user).where(eq(user.id, id)).returning({ id: user.id });
  if (!removed) return jsonError("用户不存在", 404);
  dropLive(e, id);
  return noContent();
});

function messageScope(params: URLSearchParams): SQL | undefined | null {
  const userId = params.get("userId");
  const address = params.get("address");
  const owner = userId ? eq(mailbox.ownerId, userId) : params.get("scope") === "catchAll" ? eq(mailbox.catchAll, true) : null;
  if (!owner) return null;
  return and(owner, address ? eq(mailbox.address, normalizeAddress(address)) : undefined);
}

export const listMessages = adminOnly(async (e, _params, db) => {
  const params = e.url.searchParams;
  const scope = messageScope(params);
  if (scope === null) return jsonError("参数错误", 400);
  const q = searchTerm(e);
  const rows = await db
    .select({
      id: message.id,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      subject: message.subject,
      preview: message.preview,
      code: message.code,
      seen: message.seen,
      receivedAt: message.receivedAt,
      toAddress: mailbox.address,
    })
    .from(message)
    .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
    .where(
      and(
        scope,
        before(message.receivedAt, message.id, parseCursor(params.get("cursor"))),
        q ? or(contains(mailbox.address, q), contains(message.fromAddress, q), contains(message.subject, q)) : undefined,
      ),
    )
    .orderBy(desc(message.receivedAt), desc(message.id))
    .limit(MESSAGE_PAGE + 1);
  const { page, nextCursor } = pageOf(rows, MESSAGE_PAGE, (r) => cursorKey(r.receivedAt, r.id));
  return json({ messages: page, nextCursor }, { headers: NO_STORE });
});

export const getMessage = adminOnly(async (_e, [id], db) => {
  const [[found], attachments] = await Promise.all([
    db
      .select({
        id: message.id,
        mailboxId: message.mailboxId,
        fromAddress: message.fromAddress,
        fromName: message.fromName,
        subject: message.subject,
        text: message.text,
        html: message.html,
        code: message.code,
        size: message.size,
        seen: message.seen,
        headers: message.headers,
        receivedAt: message.receivedAt,
        toAddress: mailbox.address,
        catchAll: mailbox.catchAll,
        ownerId: mailbox.ownerId,
        ownerName: user.username,
      })
      .from(message)
      .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
      .leftJoin(user, eq(user.id, mailbox.ownerId))
      .where(and(eq(message.id, id))),
    attachmentsOf(db, id),
  ]);
  if (!found) return jsonError("邮件不存在或已删除", 404);
  return json({ message: { ...found, attachments: withInline(found.html, attachments) } }, { headers: NO_STORE });
});

export const deleteMessage = adminOnly(async (_e, [id], db) => {
  const [removed] = await db.delete(message).where(eq(message.id, id)).returning({ id: message.id });
  if (!removed) return jsonError("邮件不存在或已删除", 404);
  return noContent();
});
