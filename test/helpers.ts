import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { sealData } from "iron-session";
import { getDb } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { attachment, mailbox, mailboxMember, message, session, user } from "@/db/schema";
import { handleEdge } from "@/edge";
import { USER_COOKIE, USER_SESSION_TTL } from "@/lib/session-cookie";

export const testEnv = env as CloudflareEnv;

export async function db() {
  await ensureSchema(testEnv.DB);
  return getDb(testEnv.DB);
}

let serial = 0;
export const unique = (prefix: string) => `${prefix}_${Date.now().toString(36).slice(-6)}${serial++}`.slice(0, 20);

export type TestUser = { id: string; username: string; cookie: string };

export async function createUser(prefix = "u", { disabled = false } = {}): Promise<TestUser> {
  const d = await db();
  const username = unique(prefix);
  const [created] = await d.insert(user).values({ username, passwordHash: "x", passwordSalt: "x", disabled }).returning();
  const [sid] = await d.insert(session).values({ userId: created.id }).returning();
  const sealed = await sealData({ userId: created.id, sid: sid.id, username }, { password: testEnv.SESSION_SECRET, ttl: USER_SESSION_TTL });
  return { id: created.id, username, cookie: `${USER_COOKIE}=${encodeURIComponent(sealed)}` };
}

export async function createMailbox(ownerId: string | null) {
  const d = await db();
  const [box] = await d
    .insert(mailbox)
    .values({ address: `${unique("box")}@example.com`, ownerId, expiresAt: new Date(Date.now() + 86_400_000) })
    .returning();
  const [msg] = await d.insert(message).values({ mailboxId: box.id, fromAddress: "a@b.c", subject: "hello" }).returning();
  const [file] = await d
    .insert(attachment)
    .values({ messageId: msg.id, mailboxId: box.id, filename: "a.txt", mimeType: "text/plain", size: 2, content: btoa("hi") })
    .returning();
  return { box, msg, file };
}

type CallOptions = { as?: TestUser; body?: unknown; cookie?: string; headers?: Record<string, string> };

export async function call<T = unknown>(method: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  const cookies = [options.as?.cookie, options.cookie].filter(Boolean);
  if (cookies.length) headers.cookie = cookies.join("; ");
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const request = new Request(`https://mail.test${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const pending: Promise<unknown>[] = [];
  const response = await handleEdge(request, testEnv, { waitUntil: (p) => void pending.push(p) });
  await Promise.allSettled(pending);
  if (!response) throw new Error(`no route for ${method} ${path}`);
  const text = await response.text();
  const isJson = response.headers.get("content-type")?.includes("application/json");
  return { status: response.status, body: (isJson && text ? JSON.parse(text) : text || null) as T };
}

export const at = (address: string) => encodeURIComponent(address);

export async function share(owner: TestUser, address: string, target: TestUser, role = "viewer") {
  const granted = await call<{ results: { ok: boolean; memberId: string }[] }>("POST", `/api/mailboxes/${at(address)}/members`, {
    as: owner,
    body: { usernames: [target.username], role },
  });
  const memberId = granted.body.results[0].memberId;
  await call("POST", `/api/invitations/${memberId}`, { as: target, body: { accept: true } });
  return memberId;
}

export async function expireMember(memberId: string) {
  const d = await db();
  await d.update(mailboxMember).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mailboxMember.id, memberId));
}

export async function setShareToken(mailboxId: string, token: string) {
  const d = await db();
  await d.update(mailbox).set({ shareToken: token }).where(eq(mailbox.id, mailboxId));
}
