import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { appSetting, mailbox, message } from "@/db/schema";
import { handleEmail } from "@/email/handler";
import { STORAGE_PRESSURE_KEY } from "@/lib/quota";
import { db, testEnv, unique } from "./helpers";
import { fakeCtx, fakeMessage, rawEmail, type Forwarded } from "./mail-fixtures";

beforeAll(async () => {
  await db();
});

async function deliver(to: string, env = testEnv) {
  const forwarded: Forwarded[] = [];
  await handleEmail(fakeMessage(to, rawEmail(to, "<p>code 123456</p>"), forwarded), env, fakeCtx);
  const d = await db();
  const boxes = await d.select().from(mailbox).where(eq(mailbox.address, to));
  const messages = boxes.length ? await d.select({ id: message.id }).from(message).where(eq(message.mailboxId, boxes[0].id)) : [];
  return { boxes, messages, forwarded };
}

const withoutAdmin = { ...testEnv, ADMIN_PASSWORD: "" } as CloudflareEnv;

describe("只有有效邮箱的信才入库", () => {
  it("有效邮箱照常入库", async () => {
    const to = `${unique("in")}@example.com`;
    await (await db()).insert(mailbox).values({ address: to, expiresAt: new Date(Date.now() + 86_400_000) });
    const { messages } = await deliver(to);
    expect(messages).toHaveLength(1);
  });

  it("没配置管理后台时，没人创建过的地址不入库，也不生成 Catch-all 邮箱", async () => {
    const { boxes, forwarded } = await deliver(`${unique("no")}@example.com`, withoutAdmin);
    expect(boxes).toEqual([]);
    expect(forwarded).toEqual([]);
  });

  it("已过期的邮箱不再收信", async () => {
    const to = `${unique("ex")}@example.com`;
    await (await db()).insert(mailbox).values({ address: to, expiresAt: new Date(Date.now() - 1000) });
    const { messages } = await deliver(to, withoutAdmin);
    expect(messages).toEqual([]);
  });

  it("设置了 FORWARD_TO 时，没人创建过的地址照样转发", async () => {
    const env = { ...withoutAdmin, FORWARD_TO: "me@outside.org" } as CloudflareEnv;
    const { boxes, forwarded } = await deliver(`${unique("fw")}@example.com`, env);
    expect(boxes).toEqual([]);
    expect(forwarded.map((f) => f.to)).toEqual(["me@outside.org"]);
  });
});

describe("配置了管理后台时收下 Catch-all 邮件", () => {
  it("没人创建过的地址存进 Catch-all 邮箱，用户看不到", async () => {
    const to = `${unique("ca")}@example.com`;
    const { boxes, messages } = await deliver(to);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].catchAll).toBe(true);
    expect(boxes[0].ownerId).toBeNull();
    expect(messages).toHaveLength(1);
    const again = await deliver(to);
    expect(again.boxes).toHaveLength(1);
    expect(again.messages).toHaveLength(2);
  });

  it("设置了 FORWARD_TO 时 Catch-all 邮件同样转发", async () => {
    const env = { ...testEnv, FORWARD_TO: "me@outside.org" } as CloudflareEnv;
    const { messages, forwarded } = await deliver(`${unique("cf")}@example.com`, env);
    expect(messages).toHaveLength(1);
    expect(forwarded.map((f) => f.to)).toEqual(["me@outside.org"]);
  });

  it("过期的用户邮箱被 Catch-all 接管，旧信一并清掉", async () => {
    const to = `${unique("ce")}@example.com`;
    const d = await db();
    const [old] = await d.insert(mailbox).values({ address: to, expiresAt: new Date(Date.now() - 1000) }).returning();
    await d.insert(message).values({ mailboxId: old.id, fromAddress: "a@b.c" });
    const { boxes, messages } = await deliver(to);
    expect(boxes[0].catchAll).toBe(true);
    expect(boxes[0].id).not.toBe(old.id);
    expect(messages).toHaveLength(1);
  });

  it("存储吃紧到硬上限时不再收 Catch-all 邮件", async () => {
    const d = await db();
    await d
      .insert(appSetting)
      .values({ key: STORAGE_PRESSURE_KEY, value: { level: "hard", size: 1, mark: Date.now(), freed: 0 } })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: { level: "hard", size: 1, mark: Date.now(), freed: 0 } } });
    try {
      const { boxes } = await deliver(`${unique("ch")}@example.com`);
      expect(boxes).toEqual([]);
    } finally {
      await d.delete(appSetting).where(eq(appSetting.key, STORAGE_PRESSURE_KEY));
    }
  });
});
