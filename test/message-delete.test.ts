import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attachment, mailbox, mailboxMember, message } from "@/db/schema";
import { cleanupExpired } from "@/email/cleanup";
import { at, call, createMailbox, createUser, db, setShareToken, share, testEnv } from "./helpers";

type Summary = { address: string; total: number; unread: number; latest: { id: string } | null };

async function row(id: string) {
  const d = await db();
  const [found] = await d.select().from(message).where(eq(message.id, id));
  return found;
}

async function file(id: string) {
  const d = await db();
  const [found] = await d.select().from(attachment).where(eq(attachment.id, id));
  return found;
}

describe("用户删除单封邮件", () => {
  it("立即从库里删除，连同附件，所有入口都看不到", async () => {
    const owner = await createUser("own");
    const { box, msg, file: att } = await createMailbox(owner.id);
    const path = `/api/mailboxes/${at(box.address)}`;

    expect((await call("DELETE", `/api/messages/${msg.id}`, { as: owner })).status).toBe(204);

    expect(await row(msg.id)).toBeUndefined();
    expect(await file(att.id)).toBeUndefined();
    expect((await call("GET", `/api/messages/${msg.id}`, { as: owner })).status).toBe(404);
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: owner, body: { seen: true } })).status).toBe(404);
    expect((await call("DELETE", `/api/messages/${msg.id}`, { as: owner })).status).toBe(404);
    expect((await call("GET", `/api/attachments/${att.id}`, { as: owner })).status).toBe(404);
    expect((await call<{ messages: unknown[] }>("GET", `${path}/messages`, { as: owner })).body.messages).toEqual([]);
    const list = await call<{ mailboxes: Summary[] }>("GET", "/api/mailboxes", { as: owner });
    expect(list.body.mailboxes.find((m) => m.address === box.address)).toMatchObject({ total: 0, unread: 0, latest: null });
  });

  it("没删的邮件照常显示", async () => {
    const owner = await createUser("own");
    const { box, msg } = await createMailbox(owner.id);
    const d = await db();
    const [other] = await d.insert(message).values({ mailboxId: box.id, fromAddress: "x@y.z", subject: "keep" }).returning();
    await call("DELETE", `/api/messages/${msg.id}`, { as: owner });
    const listed = await call<{ messages: { id: string }[] }>("GET", `/api/mailboxes/${at(box.address)}/messages`, { as: owner });
    expect(listed.body.messages.map((m) => m.id)).toEqual([other.id]);
    expect((await call("GET", `/api/messages/${other.id}`, { as: owner })).status).toBe(200);
  });

  it("公开链接的附件也不再可见", async () => {
    const owner = await createUser("own");
    const { box, msg, file: att } = await createMailbox(owner.id);
    await setShareToken(box.id, `del_${box.id}`);
    expect((await call("GET", `/api/attachments/${att.id}?share=del_${box.id}`)).status).toBe(200);
    await call("DELETE", `/api/messages/${msg.id}`, { as: owner });
    expect((await call("GET", `/api/attachments/${att.id}?share=del_${box.id}`)).status).toBe(404);
  });

  it("公共邮箱的匿名访客可以删除", async () => {
    const { msg } = await createMailbox(null);
    expect((await call("DELETE", `/api/messages/${msg.id}`)).status).toBe(204);
    expect(await row(msg.id)).toBeUndefined();
  });

  it("别人账号里的邮件删不掉", async () => {
    const owner = await createUser("own");
    const stranger = await createUser("str");
    const { msg } = await createMailbox(owner.id);
    expect((await call("DELETE", `/api/messages/${msg.id}`, { as: stranger })).status).toBe(404);
    expect(await row(msg.id)).toBeDefined();
  });
});

describe("清空收件箱", () => {
  it("可整理成员可以清空，只读成员不能", async () => {
    const owner = await createUser("own");
    const editor = await createUser("edi");
    const viewer = await createUser("vie");
    const { box, msg, file: att } = await createMailbox(owner.id);
    await share(owner, box.address, editor, "editor");
    await share(owner, box.address, viewer, "viewer");
    const path = `/api/mailboxes/${at(box.address)}/messages`;

    expect((await call("DELETE", path, { as: viewer })).status).toBe(403);
    expect(await row(msg.id)).toBeDefined();

    expect((await call("DELETE", path, { as: editor })).status).toBe(204);
    expect(await row(msg.id)).toBeUndefined();
    expect(await file(att.id)).toBeUndefined();
    expect((await call<{ messages: unknown[] }>("GET", path, { as: owner })).body.messages).toEqual([]);
  });
});

describe("删除邮箱", () => {
  it("邮箱、成员、邮件和附件一起删除，地址回到可用状态", async () => {
    const owner = await createUser("own");
    const bob = await createUser("bob");
    const { box, msg, file: att } = await createMailbox(owner.id);
    await share(owner, box.address, bob);
    await setShareToken(box.id, `mb_${box.id}`);
    const path = `/api/mailboxes/${at(box.address)}`;

    expect((await call("DELETE", path, { as: owner })).status).toBe(204);
    expect((await call("GET", path, { as: owner })).status).toBe(404);
    expect((await call("GET", path, { as: bob })).status).toBe(404);

    const d = await db();
    expect(await d.select().from(mailbox).where(eq(mailbox.id, box.id))).toEqual([]);
    expect(await d.select().from(mailboxMember).where(eq(mailboxMember.mailboxId, box.id))).toEqual([]);
    expect(await row(msg.id)).toBeUndefined();
    expect(await file(att.id)).toBeUndefined();

    const availability = await call<{ status: string }>("GET", `/api/availability?address=${encodeURIComponent(box.address)}`);
    expect(availability.body.status).toBe("free");
  });

  it("共享来的成员仍然不能删除邮箱", async () => {
    const owner = await createUser("own");
    const editor = await createUser("edi");
    const { box, msg } = await createMailbox(owner.id);
    await share(owner, box.address, editor, "manager");
    expect((await call("DELETE", `/api/mailboxes/${at(box.address)}`, { as: editor })).status).toBe(403);
    expect(await row(msg.id)).toBeDefined();
  });
});

describe("过期清理", () => {
  it("邮箱过期时连同邮件一起清理", async () => {
    const owner = await createUser("own");
    const { box, msg } = await createMailbox(owner.id);
    const d = await db();
    await d.update(mailbox).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mailbox.id, box.id));
    await cleanupExpired(testEnv);
    expect(await row(msg.id)).toBeUndefined();
  });
});

describe("索引", () => {
  it("用户端列表走列表索引，未读计数走只含未读邮件的部分索引", async () => {
    await db();
    const plan = async (query: string) =>
      (await testEnv.DB.prepare(`EXPLAIN QUERY PLAN ${query}`).bind("box").all<{ detail: string }>()).results.map((r) => r.detail).join(" | ");
    expect(await plan("select id from message where mailbox_id = ? order by received_at desc limit 50")).toContain("message_list_idx");
    expect(await plan("select count(*) from message where mailbox_id = ? and seen = 0")).toContain("message_unread_idx");
  });
});
