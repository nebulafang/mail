import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mailbox, message, session, user } from "@/db/schema";
import { adminPassword } from "@/lib/admin-session";
import { loadRegistrationOpen } from "@/lib/registration";
import { call, createMailbox, createUser, db, testEnv, unique } from "./helpers";

type Page<K extends string, T> = Record<K, T[]> & { nextCursor: string | null };
type ListedMessage = { id: string; toAddress: string; subject: string };

let admin = "";

beforeAll(async () => {
  await db();
  const login = await loginAdmin(adminPassword(testEnv)!);
  admin = login.cookie;
});

async function loginAdmin(password: string) {
  const request = new Request("https://mail.test/api/admin/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const { handleEdge } = await import("@/edge");
  const response = (await handleEdge(request, testEnv, { waitUntil: () => {} }))!;
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { status: response.status, cookie: setCookie.split(";")[0] };
}

async function catchAllMailbox() {
  const d = await db();
  const [box] = await d
    .insert(mailbox)
    .values({ address: `${unique("ca")}@example.com`, catchAll: true, expiresAt: new Date(Date.now() + 86_400_000) })
    .returning();
  const [msg] = await d.insert(message).values({ mailboxId: box.id, fromAddress: "spam@x.y", subject: "catch me" }).returning();
  return { box, msg };
}

describe("管理员登录", () => {
  it("密码错误时拒绝", async () => {
    const { status, cookie } = await loginAdmin("wrong-password");
    expect(status).toBe(401);
    expect(cookie).toBe("");
  });

  it("未登录访问管理接口返回 401，普通用户的会话也不行", async () => {
    const someone = await createUser("plain");
    expect((await call("GET", "/api/admin/users")).status).toBe(401);
    expect((await call("GET", "/api/admin/users", { as: someone })).status).toBe(401);
    expect((await call("GET", "/api/admin/messages?scope=catchAll", { cookie: "admin_session=forged" })).status).toBe(401);
  });

  it("会话状态反映登录情况", async () => {
    expect((await call("GET", "/api/admin/session")).body).toEqual({ enabled: true, admin: false });
    expect((await call("GET", "/api/admin/session", { cookie: admin })).body).toEqual({ enabled: true, admin: true });
  });

  it("没配置 ADMIN_PASSWORD 时整个后台关闭", async () => {
    const { handleEdge } = await import("@/edge");
    const env = { ...testEnv, ADMIN_PASSWORD: "" } as CloudflareEnv;
    const request = new Request("https://mail.test/api/admin/users", { headers: { cookie: admin } });
    const response = (await handleEdge(request, env, { waitUntil: () => {} }))!;
    expect(response.status).toBe(401);
  });
});

describe("用户管理", () => {
  it("按用户名搜索和按状态筛选", async () => {
    const active = await createUser("find");
    const disabled = await createUser("find", { disabled: true });
    const all = await call<Page<"users", { id: string }>>("GET", `/api/admin/users?q=${active.username}`, { cookie: admin });
    expect(all.body.users.map((u) => u.id)).toEqual([active.id]);
    const off = await call<Page<"users", { id: string; disabled: boolean }>>("GET", "/api/admin/users?status=disabled", { cookie: admin });
    expect(off.body.users.map((u) => u.id)).toContain(disabled.id);
    expect(off.body.users.every((u) => u.disabled)).toBe(true);
  });

  it("详情包含用户的邮箱和邮件数", async () => {
    const owner = await createUser("det");
    const { box } = await createMailbox(owner.id);
    const res = await call<{ user: { username: string; mailboxes: { address: string; total: number }[] } }>("GET", `/api/admin/users/${owner.id}`, {
      cookie: admin,
    });
    expect(res.body.user.username).toBe(owner.username);
    expect(res.body.user.mailboxes).toEqual([expect.objectContaining({ address: box.address, total: 1 })]);
  });

  it("详情列出每个登录会话的 IP 和设备型号", async () => {
    const owner = await createUser("dev");
    await (await db()).update(session).set({ ip: "203.0.113.7", model: "小米 2211133C" }).where(eq(session.userId, owner.id));
    const res = await call<{ user: { sessions: { ip: string | null; model: string | null }[] } }>("GET", `/api/admin/users/${owner.id}`, {
      cookie: admin,
    });
    expect(res.body.user.sessions).toEqual([expect.objectContaining({ ip: "203.0.113.7", model: "小米 2211133C" })]);
  });

  it("管理员可以开关注册，未登录的会话状态会带上开关", async () => {
    const d = await db();
    const registration = async () => (await call<{ registration?: boolean }>("GET", "/api/auth/session")).body.registration;
    expect((await call("GET", "/api/admin/settings")).status).toBe(401);
    expect((await call("PATCH", "/api/admin/settings", { body: { registrationOpen: false } })).status).toBe(401);
    expect((await call("GET", "/api/admin/settings", { cookie: admin })).body).toEqual({ registrationOpen: true });
    expect(await registration()).toBe(true);

    expect((await call("PATCH", "/api/admin/settings", { cookie: admin, body: { registrationOpen: "no" } })).status).toBe(400);
    expect((await call("PATCH", "/api/admin/settings", { cookie: admin, body: { registrationOpen: false } })).body).toEqual({ registrationOpen: false });
    expect(await loadRegistrationOpen(d)).toBe(false);
    expect(await registration()).toBe(false);

    await call("PATCH", "/api/admin/settings", { cookie: admin, body: { registrationOpen: true } });
    expect(await loadRegistrationOpen(d)).toBe(true);
    expect(await registration()).toBe(true);
  });

  it("统计接口只对管理员开放，计数随数据变化", async () => {
    type Stats = {
      users: { total: number; disabled: number; recent: number };
      mailboxes: { total: number; owned: number; catchAll: number };
      messages: { total: number; recent: number };
      storage: { size: number; level: string };
    };
    expect((await call("GET", "/api/admin/stats")).status).toBe(401);
    const before = (await call<Stats>("GET", "/api/admin/stats", { cookie: admin })).body;
    const owner = await createUser("sta", { disabled: true });
    await createMailbox(owner.id);
    await catchAllMailbox();
    const cached = (await call<Stats>("GET", "/api/admin/stats", { cookie: admin })).body;
    expect(cached.users.total).toBe(before.users.total);
    const after = (await call<Stats>("GET", "/api/admin/stats?fresh=1", { cookie: admin })).body;
    expect(after.users.total - before.users.total).toBe(1);
    expect(after.users.disabled - before.users.disabled).toBe(1);
    expect(after.users.recent - before.users.recent).toBe(1);
    expect(after.mailboxes.total - before.mailboxes.total).toBe(2);
    expect(after.mailboxes.owned - before.mailboxes.owned).toBe(1);
    expect(after.mailboxes.catchAll - before.mailboxes.catchAll).toBe(1);
    expect(after.messages.total - before.messages.total).toBe(2);
    expect(after.messages.recent - before.messages.recent).toBe(2);
    expect(["normal", "soft", "hard"]).toContain(after.storage.level);
  });

  it("管理员可以让用户的某一台设备退出，其他设备不受影响", async () => {
    const target = await createUser("rev");
    const d = await db();
    const [{ id: sid }] = await d.select({ id: session.id }).from(session).where(eq(session.userId, target.id));
    const [other] = await d.insert(session).values({ userId: target.id }).returning();

    expect((await call("DELETE", `/api/admin/users/${target.id}/sessions/${sid}`)).status).toBe(401);
    expect((await call("DELETE", `/api/admin/users/${target.id}/sessions/${sid}`, { cookie: admin })).status).toBe(204);
    expect((await call<{ user: unknown }>("GET", "/api/auth/session", { as: target })).body.user).toBeNull();
    expect((await d.select({ id: session.id }).from(session).where(eq(session.userId, target.id))).map((s) => s.id)).toEqual([other.id]);
    expect((await call("DELETE", `/api/admin/users/${target.id}/sessions/${sid}`, { cookie: admin })).status).toBe(404);

    const stranger = await createUser("str");
    expect((await call("DELETE", `/api/admin/users/${stranger.id}/sessions/${other.id}`, { cookie: admin })).status).toBe(404);
  });

  it("停用后用户立即被登出，恢复后可以重新登录", async () => {
    const target = await createUser("off");
    expect((await call<{ user: unknown }>("GET", "/api/auth/session", { as: target })).body.user).not.toBeNull();
    const res = await call("PATCH", `/api/admin/users/${target.id}`, { cookie: admin, body: { disabled: true } });
    expect(res.status).toBe(200);
    const d = await db();
    expect(await d.select().from(session).where(eq(session.userId, target.id))).toEqual([]);
    expect((await d.select({ disabled: user.disabled }).from(user).where(eq(user.id, target.id)))[0].disabled).toBe(true);
    expect((await call<{ user: unknown }>("GET", "/api/auth/session", { as: target })).body.user).toBeNull();
    await call("PATCH", `/api/admin/users/${target.id}`, { cookie: admin, body: { disabled: false } });
    expect((await d.select({ disabled: user.disabled }).from(user).where(eq(user.id, target.id)))[0].disabled).toBe(false);
  });

  it("删除用户会连带删除邮箱和邮件", async () => {
    const target = await createUser("del");
    const { box, msg } = await createMailbox(target.id);
    expect((await call("DELETE", `/api/admin/users/${target.id}`, { cookie: admin })).status).toBe(204);
    const d = await db();
    expect(await d.select().from(user).where(eq(user.id, target.id))).toEqual([]);
    expect(await d.select().from(mailbox).where(eq(mailbox.id, box.id))).toEqual([]);
    expect(await d.select().from(message).where(eq(message.id, msg.id))).toEqual([]);
    expect((await call("DELETE", `/api/admin/users/${target.id}`, { cookie: admin })).status).toBe(404);
  });
});

describe("邮件查看", () => {
  it("列出某个用户所有邮箱里的邮件，可以按邮箱筛选", async () => {
    const owner = await createUser("mail");
    const a = await createMailbox(owner.id);
    const b = await createMailbox(owner.id);
    const other = await createMailbox(null);
    const all = await call<Page<"messages", ListedMessage>>("GET", `/api/admin/messages?userId=${owner.id}`, { cookie: admin });
    expect(all.body.messages.map((m) => m.id).sort()).toEqual([a.msg.id, b.msg.id].sort());
    expect(all.body.messages.map((m) => m.id)).not.toContain(other.msg.id);
    const one = await call<Page<"messages", ListedMessage>>("GET", `/api/admin/messages?userId=${owner.id}&address=${encodeURIComponent(a.box.address)}`, {
      cookie: admin,
    });
    expect(one.body.messages).toEqual([expect.objectContaining({ id: a.msg.id, toAddress: a.box.address })]);
  });

  it("Catch-all 列表只有没人创建的地址收到的邮件", async () => {
    const { box, msg } = await catchAllMailbox();
    const normal = await createMailbox(null);
    const res = await call<Page<"messages", ListedMessage>>("GET", "/api/admin/messages?scope=catchAll", { cookie: admin });
    const ids = res.body.messages.map((m) => m.id);
    expect(ids).toContain(msg.id);
    expect(ids).not.toContain(normal.msg.id);
    const found = await call<Page<"messages", ListedMessage>>("GET", `/api/admin/messages?scope=catchAll&q=${box.address.slice(0, 8)}`, { cookie: admin });
    expect(found.body.messages.map((m) => m.id)).toEqual([msg.id]);
  });

  it("没有范围参数时拒绝列出全部邮件", async () => {
    expect((await call("GET", "/api/admin/messages", { cookie: admin })).status).toBe(400);
  });

  it("分页不重复也不遗漏", async () => {
    const owner = await createUser("page");
    const { box } = await createMailbox(owner.id);
    const d = await db();
    const base = Date.now();
    for (let chunk = 0; chunk < 60; chunk += 10) {
      await d.insert(message).values(
        Array.from({ length: 10 }, (_, i) => ({ mailboxId: box.id, fromAddress: "a@b.c", receivedAt: new Date(base - (chunk + i) * 1000) })),
      );
    }
    const first = await call<Page<"messages", ListedMessage>>("GET", `/api/admin/messages?userId=${owner.id}`, { cookie: admin });
    expect(first.body.messages).toHaveLength(50);
    const second = await call<Page<"messages", ListedMessage>>(
      "GET",
      `/api/admin/messages?userId=${owner.id}&cursor=${encodeURIComponent(first.body.nextCursor!)}`,
      { cookie: admin },
    );
    expect(second.body.nextCursor).toBeNull();
    const ids = [...first.body.messages, ...second.body.messages].map((m) => m.id);
    expect(new Set(ids).size).toBe(61);
  });

  it("管理员能看 Catch-all 邮件正文并删除，普通访问拿不到", async () => {
    const { box, msg } = await catchAllMailbox();
    const detail = await call<{ message: { subject: string; toAddress: string; catchAll: boolean } }>("GET", `/api/admin/messages/${msg.id}`, { cookie: admin });
    expect(detail.body.message).toEqual(expect.objectContaining({ subject: "catch me", toAddress: box.address, catchAll: true }));
    expect((await call("GET", `/api/messages/${msg.id}`)).status).toBe(404);
    expect((await call("GET", `/api/mailboxes/${encodeURIComponent(box.address)}/messages`)).status).toBe(404);
    expect((await call("DELETE", `/api/admin/messages/${msg.id}`, { cookie: admin })).status).toBe(204);
    expect((await call("GET", `/api/admin/messages/${msg.id}`, { cookie: admin })).status).toBe(404);
  });
});
