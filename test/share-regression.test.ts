import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mailboxMember, mailboxShareEvent } from "@/db/schema";
import { cleanupExpired } from "@/email/cleanup";
import { call, createMailbox, createUser, db, expireMember, share, testEnv } from "./helpers";

describe("现有行为不变", () => {
  it("公共邮箱仍然可以匿名读取和标记", async () => {
    const { box, msg } = await createMailbox(null);
    const path = `/api/mailboxes/${encodeURIComponent(box.address)}`;
    const view = await call<{ mailbox: { role: null; owned: boolean } }>("GET", path);
    expect(view.status).toBe(200);
    expect(view.body.mailbox).toMatchObject({ role: null, owned: false });
    expect((await call("PATCH", `/api/messages/${msg.id}`, { body: { seen: true } })).status).toBe(204);
  });

  it("账号邮箱主人仍然拥有全部权限", async () => {
    const owner = await createUser("own");
    const { box, msg } = await createMailbox(owner.id);
    const path = `/api/mailboxes/${encodeURIComponent(box.address)}`;
    const view = await call<{ mailbox: { role: string; owned: boolean } }>("GET", path, { as: owner });
    expect(view.body.mailbox).toMatchObject({ role: "owner", owned: true });
    expect((await call("PATCH", `/api/messages/${msg.id}`, { as: owner, body: { seen: true } })).status).toBe(204);
    expect((await call("GET", path)).status).toBe(404);
  });
});

describe("定时清理", () => {
  it("删除到期的授权并写入审计日志", async () => {
    const owner = await createUser("own");
    const bob = await createUser("bob");
    const { box } = await createMailbox(owner.id);
    const memberId = await share(owner, box.address, bob);
    await expireMember(memberId);

    await cleanupExpired(testEnv);

    const d = await db();
    expect(await d.select().from(mailboxMember).where(eq(mailboxMember.id, memberId))).toEqual([]);
    const events = await d.select().from(mailboxShareEvent).where(eq(mailboxShareEvent.mailboxId, box.id));
    expect(events.map((e) => e.action)).toContain("expire");
  });
});
