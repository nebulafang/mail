import { describe, expect, it } from "vitest";
import { migrationNames } from "@/db/migration-names.gen";
import { db, testEnv } from "./helpers";

describe("启动时的迁移检查", () => {
  it("已经迁移到最新时只按名字查最新一条，读 1 行", async () => {
    await db();
    const latest = migrationNames.at(-1)!;
    const { meta } = await testEnv.DB.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(latest).run();
    expect(meta.rows_read).toBe(1);
    const { results } = await testEnv.DB.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(migrationNames);
  });
});
