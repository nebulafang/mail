import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mailbox, mailboxMember, message } from "@/db/schema";
import { MAILBOX_COUNT_CAP } from "@/lib/config";
import { mailboxSummaries, organizableMailbox } from "@/lib/mail-queries";
import { call, createMailbox, createUser, db, testEnv, type TestUser } from "./helpers";

const UNRELATED = 40;

type Query = { toSQL: () => { sql: string; params: unknown[] } };

async function rowsRead(query: Query) {
  const { sql, params } = query.toSQL();
  const result = await testEnv.DB.prepare(sql)
    .bind(...params)
    .run();
  return result.meta.rows_read;
}

let viewer: TestUser;
let ownMessageId: string;

beforeAll(async () => {
  const d = await db();
  const stranger = await createUser("str");
  for (let i = 0; i < UNRELATED; i++) await createMailbox(i % 2 ? stranger.id : null);
  viewer = await createUser("vw");
  ownMessageId = (await createMailbox(viewer.id)).msg.id;
  const shared = await createMailbox(stranger.id);
  await d.insert(mailboxMember).values({ mailboxId: shared.box.id, userId: viewer.id, status: "active", role: "editor" });
});

describe("热点查询的扫描行数不随无关邮箱数量增长", () => {
  it("邮箱列表只读自己相关的邮箱", async () => {
    const d = await db();
    const [summary, latest] = mailboxSummaries(d, [], viewer.id);
    expect(await rowsRead(summary)).toBeLessThan(UNRELATED / 2);
    expect(await rowsRead(latest)).toBeLessThan(UNRELATED / 2);
    const list = await call<{ mailboxes: unknown[] }>("GET", "/api/mailboxes", { as: viewer });
    expect(list.body.mailboxes).toHaveLength(2);
  });

  it("标记已读只读这封信所在的邮箱", async () => {
    const d = await db();
    const check = d
      .select({ id: message.id })
      .from(message)
      .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
      .where(and(eq(message.id, ownMessageId), organizableMailbox(viewer.id)));
    expect(await rowsRead(check)).toBeLessThan(10);
    expect((await call("PATCH", `/api/messages/${ownMessageId}`, { as: viewer, body: { seen: false } })).status).toBe(204);
  });
});

describe("邮箱列表的计数封顶", () => {
  it("总数和未读数最多数到上限，读取行数不随邮件总量增长", async () => {
    const d = await db();
    const owner = await createUser("cap");
    const { box } = await createMailbox(owner.id);
    for (let i = 0; i < 30; i++) {
      await d.insert(message).values(Array.from({ length: 8 }, (_, j) => ({ mailboxId: box.id, fromAddress: "a@b.c", seen: (i * 8 + j) % 40 !== 0 })));
    }
    const list = await call<{ mailboxes: { address: string; total: number; unread: number }[] }>("GET", "/api/mailboxes", { as: owner });
    expect(list.body.mailboxes.find((m) => m.address === box.address)).toMatchObject({ total: MAILBOX_COUNT_CAP, unread: 7 });
    const [summary] = mailboxSummaries(d, [], owner.id);
    expect(await rowsRead(summary)).toBeLessThan(MAILBOX_COUNT_CAP + 30);
  });
});
