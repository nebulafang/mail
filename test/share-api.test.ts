import { describe, expect, it } from "vitest";
import { call, createMailbox, createUser, expireMember, setShareToken, share, type TestUser } from "./helpers";

type Results = { results: { username: string; ok: boolean; error?: string; memberId?: string }[] };
type MailboxView = { mailbox: { role: string | null; owned: boolean; sharedBy: string | null; shareToken: string | null } };

async function setup() {
  const owner = await createUser("own");
  const bob = await createUser("bob");
  const { box, msg, file } = await createMailbox(owner.id);
  return { owner, bob, box, msg, file, path: `/api/mailboxes/${encodeURIComponent(box.address)}` };
}

const status = async (as: TestUser, path: string) => (await call("GET", path, { as })).status;

describe("分享与接受", () => {
  it("分享后需要接受才能访问，接受后以只读身份看到邮箱", async () => {
    const { owner, bob, path, box } = await setup();
    const granted = await call<Results>("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username] } });
    expect(granted.status).toBe(201);
    expect(granted.body.results[0]).toMatchObject({ ok: true });

    expect(await status(bob, path)).toBe(404);
    const invites = await call<{ invitations: { id: string; address: string; role: string; owner: string }[] }>("GET", "/api/invitations", {
      as: bob,
    });
    expect(invites.body.invitations).toEqual([expect.objectContaining({ address: box.address, role: "viewer", owner: owner.username })]);

    const accepted = await call("POST", `/api/invitations/${invites.body.invitations[0].id}`, { as: bob, body: { accept: true } });
    expect(accepted.status).toBe(200);

    const view = await call<MailboxView>("GET", path, { as: bob });
    expect(view.status).toBe(200);
    expect(view.body.mailbox).toMatchObject({ role: "viewer", owned: false, sharedBy: owner.username, shareToken: null });

    const list = await call<{ mailboxes: { address: string; role: string }[] }>("GET", "/api/mailboxes", { as: bob });
    expect(list.body.mailboxes).toEqual([expect.objectContaining({ address: box.address, role: "viewer" })]);
  });

  it("拒绝邀请后无法访问，邀请也不能再次处理", async () => {
    const { owner, bob, path } = await setup();
    const granted = await call<Results>("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username] } });
    const id = granted.body.results[0].memberId;
    expect((await call("POST", `/api/invitations/${id}`, { as: bob, body: { accept: false } })).status).toBe(204);
    expect(await status(bob, path)).toBe(404);
    expect((await call("POST", `/api/invitations/${id}`, { as: bob, body: { accept: true } })).status).toBe(404);
  });

  it("不能替别人接受邀请", async () => {
    const { owner, bob, path } = await setup();
    const eve = await createUser("eve");
    const granted = await call<Results>("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username] } });
    const id = granted.body.results[0].memberId;
    expect((await call("POST", `/api/invitations/${id}`, { as: eve, body: { accept: true } })).status).toBe(404);
    expect(await status(eve, path)).toBe(404);
  });

  it("未登录看不到邀请，也不能分享", async () => {
    const { path } = await setup();
    expect((await call<{ invitations: unknown[] }>("GET", "/api/invitations")).body.invitations).toEqual([]);
    expect((await call("POST", `${path}/members`, { body: { usernames: ["someone"] } })).status).toBe(401);
  });
});

describe("边界情况", () => {
  it("批量分享逐个返回结果：自己、不存在、禁用、重复都会被拒绝", async () => {
    const { owner, bob, path } = await setup();
    const carol = await createUser("car");
    const banned = await createUser("ban", { disabled: true });
    await call("POST", `${path}/members`, { as: owner, body: { usernames: [carol.username] } });

    const res = await call<Results>("POST", `${path}/members`, {
      as: owner,
      body: { usernames: [bob.username, owner.username, "nobody_here", banned.username, carol.username] },
    });
    expect(res.status).toBe(201);
    expect(res.body.results.map((r) => [r.ok, r.error ?? null])).toEqual([
      [true, null],
      [false, "不能分享给自己"],
      [false, "没有找到这个用户"],
      [false, "没有找到这个用户"],
      [false, "已经邀请过对方，等待接受"],
    ]);
  });

  it("全部失败时返回 200 且没有新成员", async () => {
    const { owner, path } = await setup();
    const res = await call<Results>("POST", `${path}/members`, { as: owner, body: { usernames: [owner.username] } });
    expect(res.status).toBe(200);
    expect((await call<{ members: unknown[] }>("GET", `${path}/members`, { as: owner })).body.members).toEqual([]);
  });

  it("已过期的授权可以重新分享", async () => {
    const { owner, bob, path, box } = await setup();
    const memberId = await share(owner, box.address, bob);
    await expireMember(memberId);
    const res = await call<Results>("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username], role: "editor" } });
    expect(res.body.results[0].ok).toBe(true);
    expect(await status(bob, path)).toBe(404);
  });

  it("公共邮箱不能分享给用户", async () => {
    const someone = await createUser("pub");
    const { box } = await createMailbox(null);
    const res = await call("POST", `/api/mailboxes/${encodeURIComponent(box.address)}/members`, { as: someone, body: { usernames: ["abc"] } });
    expect(res.status).toBe(403);
  });

  it("拒绝过去的有效期和不存在的角色", async () => {
    const { owner, bob, path } = await setup();
    const past = await call("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username], expiresAt: "2000-01-01T00:00:00Z" } });
    expect(past.status).toBe(400);
    const ownerRole = await call("POST", `${path}/members`, { as: owner, body: { usernames: [bob.username], role: "owner" } });
    expect(ownerRole.status).toBe(400);
  });

  it("查询用户必须输入完整用户名，并提示问题", async () => {
    const { owner, bob, path, box } = await setup();
    const lookup = (as: TestUser, username: string) =>
      call<{ problem: string | null }>("GET", `${path}/members/lookup?username=${encodeURIComponent(username)}`, { as });
    expect((await lookup(owner, bob.username)).body.problem).toBeNull();
    expect((await lookup(owner, bob.username.slice(0, 5))).body.problem).toBe("missing");
    expect((await lookup(owner, owner.username)).body.problem).toBe("self");
    await share(owner, box.address, bob);
    expect((await lookup(owner, bob.username)).body.problem).toBe("member");
    expect((await lookup(bob, owner.username)).status).toBe(403);
  });
});

describe("权限", () => {
  it("只读成员可以读邮件和附件，但不能标记已读或管理成员", async () => {
    const { owner, bob, path, msg, file, box } = await setup();
    await share(owner, box.address, bob, "viewer");
    expect(await status(bob, `${path}/messages`)).toBe(200);
    expect(await status(bob, `/api/messages/${msg.id}`)).toBe(200);
    expect(await status(bob, `/api/attachments/${file.id}`)).toBe(200);
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: bob, body: { seen: true } })).status).toBe(404);
    expect(await status(bob, `${path}/members`)).toBe(403);
    expect(await status(bob, `${path}/activity`)).toBe(403);
    expect((await call("POST", `${path}/members`, { as: bob, body: { usernames: [owner.username] } })).status).toBe(403);
  });

  it("可整理成员可以标记已读", async () => {
    const { owner, bob, msg, box } = await setup();
    await share(owner, box.address, bob, "editor");
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: bob, body: { seen: true } })).status).toBe(204);
  });

  it("可管理成员可以邀请他人，但不能修改或移除自己", async () => {
    const { owner, bob, path, box } = await setup();
    const carol = await createUser("car");
    const memberId = await share(owner, box.address, bob, "manager");
    const res = await call<Results>("POST", `${path}/members`, { as: bob, body: { usernames: [carol.username], role: "manager" } });
    expect(res.body.results[0].ok).toBe(true);
    expect((await call("PATCH", `${path}/members/${memberId}`, { as: bob, body: { role: "viewer" } })).status).toBe(403);
    expect((await call("DELETE", `${path}/members/${memberId}`, { as: bob })).status).toBe(403);
  });

  it("陌生人既看不到邮箱也看不到成员", async () => {
    const { path } = await setup();
    const eve = await createUser("eve");
    expect(await status(eve, path)).toBe(404);
    expect(await status(eve, `${path}/members`)).toBe(404);
  });

  it("成员看不到公开分享链接的 token", async () => {
    const { owner, bob, box, path } = await setup();
    await setShareToken(box.id, "secret-token");
    await share(owner, box.address, bob);
    expect((await call<MailboxView>("GET", path, { as: bob })).body.mailbox.shareToken).toBeNull();
    expect((await call<MailboxView>("GET", path, { as: owner })).body.mailbox.shareToken).toBe("secret-token");
  });
});

describe("修改、撤销与到期", () => {
  it("修改角色立即生效", async () => {
    const { owner, bob, path, msg, box } = await setup();
    const memberId = await share(owner, box.address, bob, "viewer");
    const updated = await call<{ member: { role: string } }>("PATCH", `${path}/members/${memberId}`, { as: owner, body: { role: "editor" } });
    expect(updated.body.member.role).toBe("editor");
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: bob, body: { seen: true } })).status).toBe(204);
  });

  it("撤销后立即失去访问权限", async () => {
    const { owner, bob, path, box, msg } = await setup();
    const memberId = await share(owner, box.address, bob);
    expect(await status(bob, path)).toBe(200);
    expect((await call("DELETE", `${path}/members/${memberId}`, { as: owner })).status).toBe(204);
    expect(await status(bob, path)).toBe(404);
    expect(await status(bob, `/api/messages/${msg.id}`)).toBe(404);
  });

  it("到期后立即失去访问权限", async () => {
    const { owner, bob, path, box } = await setup();
    const memberId = await share(owner, box.address, bob);
    await expireMember(memberId);
    expect(await status(bob, path)).toBe(404);
  });

  it("成员可以主动退出", async () => {
    const { owner, bob, path, box } = await setup();
    await share(owner, box.address, bob);
    expect((await call("DELETE", `${path}/membership`, { as: bob })).status).toBe(204);
    expect(await status(bob, path)).toBe(404);
    expect((await call("DELETE", `${path}/membership`, { as: bob })).status).toBe(404);
  });

  it("审计日志按时间倒序记录分享、接受、修改、撤销", async () => {
    const { owner, bob, path, box } = await setup();
    const memberId = await share(owner, box.address, bob);
    await call("PATCH", `${path}/members/${memberId}`, { as: owner, body: { role: "editor" } });
    await call("DELETE", `${path}/members/${memberId}`, { as: owner });
    const log = await call<{ events: { action: string; actor: string; target: string }[] }>("GET", `${path}/activity`, { as: owner });
    expect(log.body.events.map((e) => e.action)).toEqual(["revoke", "update", "accept", "grant"]);
    expect(log.body.events[3]).toMatchObject({ actor: owner.username, target: bob.username });
  });
});
