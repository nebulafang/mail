import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { message, session } from "@/db/schema";
import { handleEdge } from "@/edge";
import { at, call, createMailbox, createUser, db, testEnv } from "./helpers";

const exhausted = { limit: async () => ({ success: false }) } as unknown as RateLimit;

async function callWith(env: CloudflareEnv, path: string) {
  const response = await handleEdge(new Request(`https://mail.test${path}`), env, { waitUntil: () => {} });
  return response!.status;
}

describe("跨站请求", () => {
  it("Origin 不是本站时拒绝写操作", async () => {
    const owner = await createUser("xs");
    const { box } = await createMailbox(owner.id);
    const foreign = await call("DELETE", `/api/mailboxes/${at(box.address)}`, { as: owner, headers: { origin: "https://evil.test" } });
    expect(foreign.status).toBe(403);
    const opaque = await call("DELETE", `/api/mailboxes/${at(box.address)}`, { as: owner, headers: { origin: "null" } });
    expect(opaque.status).toBe(403);
    const fetchMeta = await call("DELETE", `/api/mailboxes/${at(box.address)}`, { as: owner, headers: { "sec-fetch-site": "cross-site" } });
    expect(fetchMeta.status).toBe(403);
    const same = await call("DELETE", `/api/mailboxes/${at(box.address)}`, { as: owner, headers: { origin: "https://mail.test" } });
    expect(same.status).toBe(204);
  });

  it("跨站的读请求不受影响", async () => {
    const { box } = await createMailbox(null);
    const read = await call("GET", `/api/mailboxes/${at(box.address)}`, { headers: { origin: "https://evil.test" } });
    expect(read.status).toBe(200);
  });
});

describe("按地址读取的限流", () => {
  it("额度用完后返回 429", async () => {
    const { box } = await createMailbox(null);
    const env = { ...testEnv, READ_LIMITER: exhausted };
    expect(await callWith(env, `/api/availability?address=${at(box.address)}`)).toBe(429);
    expect(await callWith(env, `/api/mailboxes/${at(box.address)}`)).toBe(429);
    expect(await callWith(env, `/api/mailboxes/${at(box.address)}/messages`)).toBe(429);
    expect(await callWith(env, `/api/mailboxes?address=${at(box.address)}`)).toBe(429);
  });

  it("不带地址的账号邮箱列表不计入限流", async () => {
    expect(await callWith({ ...testEnv, READ_LIMITER: exhausted }, "/api/mailboxes")).toBe(200);
  });
});

describe("会话被撤销后", () => {
  it("标记已读不会写入数据库", async () => {
    const owner = await createUser("rv");
    const { msg } = await createMailbox(owner.id);
    const d = await db();
    await d.delete(session).where(eq(session.userId, owner.id));
    const response = await call("PATCH", `/api/messages/${msg.id}`, { as: owner, body: { seen: true } });
    expect(response.status).toBe(404);
    const [row] = await d.select({ seen: message.seen }).from(message).where(eq(message.id, msg.id));
    expect(row.seen).toBe(false);
  });

  it("有效会话仍可以标记已读", async () => {
    const owner = await createUser("ok");
    const { msg } = await createMailbox(owner.id);
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: owner, body: { seen: true } })).status).toBe(204);
    const [row] = await (await db()).select({ seen: message.seen }).from(message).where(eq(message.id, msg.id));
    expect(row.seen).toBe(true);
  });
});
