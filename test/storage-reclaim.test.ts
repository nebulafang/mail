import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { attachment, mailbox, mailboxShareEvent, message, user } from "@/db/schema";
import { RECLAIM_SHARE_EVENT_DAYS, reclaimStorage } from "@/email/reclaim";
import { logShare } from "@/lib/share-log";
import { createMailbox, createUser, db, type TestUser } from "./helpers";

const DAY = 86_400_000;

type Fixture = {
  owner: TestUser;
  owned: Awaited<ReturnType<typeof createMailbox>>;
  catchAll: Awaited<ReturnType<typeof createMailbox>>;
  oldEventMailbox: string;
};

let f: Fixture;

beforeEach(async () => {
  const d = await db();
  const now = Date.now();
  const owner = await createUser("rc");
  const owned = await createMailbox(owner.id);
  await d
    .update(message)
    .set({ html: "<p>keep text</p>", text: "keep text", receivedAt: new Date(now - 300 * DAY) })
    .where(eq(message.id, owned.msg.id));

  const catchAll = await createMailbox(null);
  await d.update(mailbox).set({ catchAll: true, expiresAt: new Date(now - 1000 * DAY) }).where(eq(mailbox.id, catchAll.box.id));

  const oldEventMailbox = `old-${owned.box.id}`;
  await logShare(d, { box: { id: oldEventMailbox, address: owned.box.address }, action: "grant", at: new Date(now - (RECLAIM_SHARE_EVENT_DAYS + 5) * DAY) });

  f = {
    owner,
    owned,
    catchAll,
    oldEventMailbox,
  };
});

async function snapshot() {
  const d = await db();
  return {
    ownedMessage: (await d.select({ html: message.html, text: message.text }).from(message).where(eq(message.id, f.owned.msg.id)))[0],
    ownedBox: (await d.select({ id: mailbox.id }).from(mailbox).where(eq(mailbox.id, f.owned.box.id))).length,
    ownedFile: (await d.select({ content: attachment.content }).from(attachment).where(eq(attachment.id, f.owned.file.id)))[0],
    catchAll: (await d.select({ id: mailbox.id }).from(mailbox).where(eq(mailbox.id, f.catchAll.box.id))).length,
    oldEvents: (await d.select({ id: mailboxShareEvent.id }).from(mailboxShareEvent).where(eq(mailboxShareEvent.mailboxId, f.oldEventMailbox))).length,
    user: (await d.select({ id: user.id }).from(user).where(eq(user.id, f.owner.id))).length,
  };
}

describe("存储回收", () => {
  it("按顺序回收：先清附件内容，需求满足就停", async () => {
    const report = await reclaimStorage(await db(), 1);
    const after = await snapshot();
    expect(Object.keys(report.steps)).toEqual(["attachment_content"]);
    expect(after.ownedFile.content).toBeNull();
    expect(after.catchAll).toBe(1);
    expect(after.ownedMessage.html).not.toBeNull();
  });

  it("需求足够大时逐级回收，但绝不删除账号、账号邮箱和邮件本身", async () => {
    const report = await reclaimStorage(await db(), Number.MAX_SAFE_INTEGER, new Date(), { writeBudget: 1_000_000, queryLimit: 1_000 });
    const after = await snapshot();
    expect(report.freed).toBeGreaterThan(0);
    expect(after.ownedFile.content).toBeNull();
    expect(after.catchAll).toBe(0);
    expect(after.ownedMessage).toEqual({ html: null, text: "keep text" });
    expect(after.oldEvents).toBe(0);
    expect(after.ownedBox).toBe(1);
    expect(after.user).toBe(1);
  });

  it("写入预算和查询次数用完就停", async () => {
    const byWrites = await reclaimStorage(await db(), Number.MAX_SAFE_INTEGER, new Date(), { writeBudget: 1, queryLimit: 1_000 });
    expect(Object.keys(byWrites.steps)).toEqual(["attachment_content"]);
    expect(byWrites.queries).toBe(2);

    const byQueries = await reclaimStorage(await db(), Number.MAX_SAFE_INTEGER, new Date(), { writeBudget: 1_000_000, queryLimit: 3 });
    expect(byQueries.queries).toBeLessThanOrEqual(3);
  });
});
