import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { appSetting, attachment, mailbox, message } from "@/db/schema";
import { handleEmail } from "@/email/handler";
import { manageStorage, measureStorage, pressureOf, reclaimNeed, STORAGE_PRESSURE_KEY, type StoragePressure } from "@/lib/quota";
import { db, testEnv, unique } from "./helpers";
import { fakeCtx, fakeMessage, rawEmail } from "./mail-fixtures";

const MB = 1024 * 1024;

async function setPressure(level: StoragePressure) {
  const d = await db();
  await d.delete(appSetting).where(eq(appSetting.key, STORAGE_PRESSURE_KEY));
  if (level !== "normal") await d.insert(appSetting).values({ key: STORAGE_PRESSURE_KEY, value: { level, size: 0 } });
}

async function receive(env: CloudflareEnv, html: string, files: { name: string; bytes: number }[]) {
  const to = `${unique("q")}@example.com`;
  await (await db()).insert(mailbox).values({ address: to, expiresAt: new Date(Date.now() + 86_400_000) });
  await handleEmail(fakeMessage(to, rawEmail(to, html, files)), env, fakeCtx);
  const d = await db();
  const [msg] = await d
    .select({ id: message.id, html: message.html, text: message.text })
    .from(message)
    .innerJoin(mailbox, eq(mailbox.id, message.mailboxId))
    .where(eq(mailbox.address, to));
  const stored = await d
    .select({ filename: attachment.filename, saved: attachment.content, size: attachment.size })
    .from(attachment)
    .where(eq(attachment.messageId, msg.id))
    .orderBy(attachment.filename);
  return { msg, files: stored.map((f) => ({ filename: f.filename, saved: f.saved !== null, size: f.size })) };
}

beforeEach(() => setPressure("normal"));

describe("存储水位", () => {
  it("按数据库大小判断水位，拿不到大小时视为正常", () => {
    const limits = { softBytes: 400 * MB, hardBytes: 470 * MB };
    expect(pressureOf(0, limits)).toBe("normal");
    expect(pressureOf(399 * MB, limits)).toBe("normal");
    expect(pressureOf(400 * MB, limits)).toBe("soft");
    expect(pressureOf(470 * MB, limits)).toBe("hard");
  });

  it("删除后文件不缩小时按已回收字节估算用量，文件长大或缩小后重新计量", () => {
    const limits = { softBytes: 400 * MB, hardBytes: 470 * MB };
    const empty = { level: "normal" as const, size: 0, mark: 0, freed: 0 };

    const first = measureStorage(empty, 480 * MB);
    expect(first).toEqual({ mark: 480 * MB, freed: 0, used: 480 * MB });
    expect(reclaimNeed(first.used, limits)).toBe(80 * MB);

    const afterReclaim = { level: "soft" as const, size: 480 * MB, mark: 480 * MB, freed: 80 * MB };
    expect(measureStorage(afterReclaim, 480 * MB).used).toBe(400 * MB);
    expect(reclaimNeed(400 * MB, limits)).toBe(0);

    const grown = measureStorage(afterReclaim, 481 * MB);
    expect(grown).toEqual({ mark: 481 * MB, freed: 0, used: 481 * MB });
    expect(reclaimNeed(grown.used, limits)).toBe(81 * MB);

    expect(measureStorage(afterReclaim, 300 * MB).used).toBe(300 * MB);
    expect(reclaimNeed(0, limits)).toBe(0);
  });

  it("状态变化时才写 app_setting", async () => {
    const d = await db();
    const env = { ...testEnv, STORAGE_SOFT_LIMIT_MB: "0", STORAGE_HARD_LIMIT_MB: "100000" } as CloudflareEnv;
    const never = async () => {
      throw new Error("不该回收");
    };
    expect((await manageStorage(env, d, never, new Date(1_000))).level).toBe("soft");
    expect((await manageStorage(env, d, never, new Date(2_000))).level).toBe("soft");
    const [row] = await d.select().from(appSetting).where(eq(appSetting.key, STORAGE_PRESSURE_KEY));
    expect(row.updatedAt.getTime()).toBe(1_000);
    expect((await manageStorage(testEnv, d, never)).level).toBe("normal");
  });

  it("超过硬水位时触发回收，回收失败也照样记下硬水位", async () => {
    const d = await db();
    const env = { ...testEnv, STORAGE_SOFT_LIMIT_MB: "0", STORAGE_HARD_LIMIT_MB: "0" } as CloudflareEnv;
    const asked: number[] = [];
    const failing = async (need: number) => {
      asked.push(need);
      throw new Error("写不进去");
    };
    const result = await manageStorage(env, d, failing);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeGreaterThan(0);
    expect(result.level).toBe("hard");
  });
});

describe("收信按水位降级，信本身照收", () => {
  it("附件只记录文件名和大小，不保存内容", async () => {
    const { msg, files } = await receive(testEnv, "<p>hello</p>", [
      { name: "a.bin", bytes: 1000 },
      { name: "b.bin", bytes: 10 },
    ]);
    expect(msg.html).toContain("hello");
    expect(files).toEqual([
      { filename: "a.bin", saved: false, size: 1000 },
      { filename: "b.bin", saved: false, size: 10 },
    ]);
  });

  it("软水位不存附件内容并截短正文", async () => {
    await setPressure("soft");
    const { msg, files } = await receive(testEnv, `<p>${"y".repeat(60_000)}</p>`, [{ name: "a.bin", bytes: 10 }]);
    expect(msg.html!.length).toBe(50_000);
    expect(msg.text!.length).toBeLessThanOrEqual(50_000);
    expect(files).toEqual([{ filename: "a.bin", saved: false, size: 10 }]);
  });

  it("硬水位只保留纯文本", async () => {
    await setPressure("hard");
    const { msg, files } = await receive(testEnv, `<p>${"z".repeat(30_000)}</p>`, [{ name: "a.bin", bytes: 10 }]);
    expect(msg.html).toBeNull();
    expect(msg.text!.length).toBe(20_000);
    expect(files).toEqual([{ filename: "a.bin", saved: false, size: 10 }]);
  });
});
