import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attachment, mailbox, message } from "@/db/schema";
import { deleteExpiredMailboxes, trimMailboxes } from "@/email/cleanup";
import { createMailbox, db } from "./helpers";

const DAY = 86_400_000;

describe("定时清理按批删除过期邮箱", () => {
  it("每次最多删 limit 个，最早过期的先删，剩下的下一轮再删", async () => {
    const d = await db();
    const now = Date.now();
    const boxes = [];
    for (let i = 0; i < 5; i++) {
      const { box } = await createMailbox(null);
      await d.update(mailbox).set({ expiresAt: new Date(now - (10 - i) * DAY) }).where(eq(mailbox.id, box.id));
      boxes.push(box);
    }
    const alive = (await createMailbox(null)).box;
    const ids = [...boxes.map((b) => b.id), alive.id];
    const remaining = async () => (await d.select({ id: mailbox.id }).from(mailbox).where(inArray(mailbox.id, ids))).map((r) => r.id);

    await deleteExpiredMailboxes(d, new Date(now), 2);
    expect((await remaining()).sort()).toEqual([boxes[2].id, boxes[3].id, boxes[4].id, alive.id].sort());

    await deleteExpiredMailboxes(d, new Date(now), 10);
    expect(await remaining()).toEqual([alive.id]);
    expect(await d.select().from(message).where(inArray(message.mailboxId, boxes.map((b) => b.id)))).toEqual([]);
    expect(await d.select().from(attachment).where(inArray(attachment.mailboxId, boxes.map((b) => b.id)))).toEqual([]);
  });
});

describe("单个邮箱最多保留最近的邮件", () => {
  it("最近收过信的邮箱只保留最新的若干封，其他邮箱不动", async () => {
    const d = await db();
    const now = Date.now();
    const { box } = await createMailbox(null);
    const quiet = await createMailbox(null);
    const minutesAgo = (m: number) => new Date(now - m * 60_000);
    await d.delete(message).where(inArray(message.mailboxId, [box.id, quiet.box.id]));
    const inserted = await d
      .insert(message)
      .values([70, 60, 50, 40, 30, 20, 10].map((m) => ({ mailboxId: box.id, fromAddress: "a@b.c", subject: `m${m}`, receivedAt: minutesAgo(m) })))
      .returning({ id: message.id, subject: message.subject });
    await d
      .insert(message)
      .values([600, 500, 400, 300].map((m) => ({ mailboxId: quiet.box.id, fromAddress: "a@b.c", subject: `q${m}`, receivedAt: minutesAgo(m) })));

    await trimMailboxes(d, new Date(now), 5);

    const left = await d.select({ subject: message.subject }).from(message).where(eq(message.mailboxId, box.id));
    expect(left.map((m) => m.subject).sort()).toEqual(["m10", "m20", "m30", "m40", "m50"]);
    expect(inserted).toHaveLength(7);
    expect(await d.select().from(message).where(eq(message.mailboxId, quiet.box.id))).toHaveLength(4);
  });
});
