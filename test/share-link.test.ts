import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mailbox, mailboxShareEvent } from "@/db/schema";
import { expireShareLinks } from "@/email/cleanup";
import { expiredShareQuery, sharedMailboxWhere } from "@/lib/mail-queries";
import { at, call, createMailbox, createUser, db, setShareToken, share } from "./helpers";

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

type LinkInfo = { shareToken: string; shareExpiresAt: string | null };

async function setup() {
  const owner = await createUser("own");
  const { box, file } = await createMailbox(owner.id);
  return { owner, box, file, path: `/api/mailboxes/${at(box.address)}` };
}

async function findShared(token: string) {
  const d = await db();
  const [row] = await d.select({ id: mailbox.id }).from(mailbox).where(sharedMailboxWhere(token));
  return row;
}

async function setLinkExpiry(id: string, expiresAt: Date | null) {
  const d = await db();
  await d.update(mailbox).set({ shareExpiresAt: expiresAt }).where(eq(mailbox.id, id));
}

describe("公开链接有效期", () => {
  it("开启时可以设置有效期，主人能看到，成员看不到", async () => {
    const { owner, box, path } = await setup();
    const bob = await createUser("bob");
    await share(owner, box.address, bob, "manager");

    const created = await call<LinkInfo>("POST", `${path}/share`, { as: owner, body: { expiresAt: inDays(7) } });
    expect(created.status).toBe(201);
    expect(new Date(created.body.shareExpiresAt!).getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
    expect(await findShared(created.body.shareToken)).toEqual({ id: box.id });

    const ownerView = await call<{ mailbox: { shareExpiresAt: string | null } }>("GET", path, { as: owner });
    expect(ownerView.body.mailbox.shareExpiresAt).toBe(created.body.shareExpiresAt);
    const memberView = await call<{ mailbox: { shareExpiresAt: string | null; shareToken: string | null } }>("GET", path, { as: bob });
    expect(memberView.body.mailbox).toMatchObject({ shareExpiresAt: null, shareToken: null });

    expect((await call("POST", `${path}/share`, { as: bob, body: { expiresAt: null } })).status).toBe(403);
  });

  it("没有设置有效期的旧链接和不带参数的旧客户端都保持不限期", async () => {
    const { owner, box, path } = await setup();
    await setShareToken(box.id, `legacy_${box.id}`);
    expect(await findShared(`legacy_${box.id}`)).toEqual({ id: box.id });

    const created = await call<LinkInfo>("POST", `${path}/share`, { as: owner });
    expect(created.status).toBe(201);
    expect(created.body.shareExpiresAt).toBeNull();
    expect(await findShared(`legacy_${box.id}`)).toBeUndefined();
    expect(await findShared(created.body.shareToken)).toEqual({ id: box.id });
  });

  it("到期后链接和附件都无法访问，并能识别为已过期", async () => {
    const { box, file } = await setup();
    const token = `exp_${box.id}`;
    await setShareToken(box.id, token);
    expect((await call("GET", `/api/attachments/${file.id}?share=${token}`)).status).toBe(200);

    const expiredAt = new Date(Date.now() - 1000);
    await setLinkExpiry(box.id, expiredAt);
    expect(await findShared(token)).toBeUndefined();
    expect((await call("GET", `/api/attachments/${file.id}?share=${token}`)).status).toBe(404);

    const d = await db();
    const [expired] = await expiredShareQuery(d, token);
    expect(expired.expiredAt?.getTime()).toBe(expiredAt.getTime());
    expect(await expiredShareQuery(d, "no_such_token")).toEqual([]);
  });

  it("可以修改有效期、恢复已过期的链接，地址不变并记录日志", async () => {
    const { owner, box, path } = await setup();
    const created = await call<LinkInfo>("POST", `${path}/share`, { as: owner, body: { expiresAt: inDays(1) } });
    const token = created.body.shareToken;
    await setLinkExpiry(box.id, new Date(Date.now() - 1000));
    expect(await findShared(token)).toBeUndefined();

    const renewed = await call<LinkInfo>("PATCH", `${path}/share`, { as: owner, body: { expiresAt: inDays(30) } });
    expect(renewed.status).toBe(200);
    expect(renewed.body.shareToken).toBe(token);
    expect(await findShared(token)).toEqual({ id: box.id });

    const unlimited = await call<LinkInfo>("PATCH", `${path}/share`, { as: owner, body: { expiresAt: null } });
    expect(unlimited.body.shareExpiresAt).toBeNull();

    const d = await db();
    const logs = await d
      .select({ action: mailboxShareEvent.action, detail: mailboxShareEvent.detail })
      .from(mailboxShareEvent)
      .where(and(eq(mailboxShareEvent.mailboxId, box.id), eq(mailboxShareEvent.action, "link_expiry")));
    expect(logs).toHaveLength(2);
    expect(logs[1].detail).toMatchObject({ expiresAt: null });
  });

  it("拒绝无效的有效期，未开启链接时不能修改", async () => {
    const { owner, path } = await setup();
    expect((await call("PATCH", `${path}/share`, { as: owner, body: { expiresAt: inDays(1) } })).status).toBe(404);
    expect((await call("POST", `${path}/share`, { as: owner, body: { expiresAt: inDays(-1) } })).status).toBe(400);
    expect((await call("POST", `${path}/share`, { as: owner, body: { expiresAt: inDays(400) } })).status).toBe(400);
    expect((await call("POST", `${path}/share`, { as: owner, body: { expiresAt: "tomorrow" } })).status).toBe(400);
  });

  it("停止分享会同时清除有效期", async () => {
    const { owner, box, path } = await setup();
    await call("POST", `${path}/share`, { as: owner, body: { expiresAt: inDays(7) } });
    expect((await call("DELETE", `${path}/share`, { as: owner })).status).toBe(204);
    const d = await db();
    const [row] = await d.select({ token: mailbox.shareToken, until: mailbox.shareExpiresAt }).from(mailbox).where(eq(mailbox.id, box.id));
    expect(row).toEqual({ token: null, until: null });
  });
});

describe("定时任务", () => {
  it("到期时只记一次日志，宽限期过后清除链接", async () => {
    const { box } = await setup();
    await setShareToken(box.id, `cron_${box.id}`);
    const expiredAt = new Date(Date.now() - 60_000);
    await setLinkExpiry(box.id, expiredAt);

    const d = await db();
    await expireShareLinks(d);
    await expireShareLinks(d);
    const logs = await d
      .select({ at: mailboxShareEvent.at, source: mailboxShareEvent.source })
      .from(mailboxShareEvent)
      .where(and(eq(mailboxShareEvent.mailboxId, box.id), eq(mailboxShareEvent.action, "link_expire")));
    expect(logs).toEqual([{ at: expiredAt, source: "system" }]);

    const [kept] = await d.select({ token: mailbox.shareToken }).from(mailbox).where(eq(mailbox.id, box.id));
    expect(kept.token).toBe(`cron_${box.id}`);

    await setLinkExpiry(box.id, new Date(Date.now() - 31 * DAY));
    await expireShareLinks(d);
    const [cleared] = await d.select({ token: mailbox.shareToken, until: mailbox.shareExpiresAt }).from(mailbox).where(eq(mailbox.id, box.id));
    expect(cleared).toEqual({ token: null, until: null });
  });
});
