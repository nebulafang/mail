import { describe, expect, it } from "vitest";
import { cursorKey, pageOf, parseCursor } from "@/lib/cursor";

describe("parseCursor", () => {
  it("还原 cursorKey 生成的游标", () => {
    const at = new Date(Date.UTC(2026, 9, 2, 8, 0));
    expect(parseCursor(cursorKey(at, "abc_def"))).toEqual({ at, id: "abc_def" });
  });

  it.each([null, "", "abc", "_id", "nope_id", "123_"])("格式不对的游标 %j 当作第一页", (raw) => {
    expect(parseCursor(raw)).toBeNull();
  });
});

describe("pageOf", () => {
  const rows = [1, 2, 3];

  it("多取到一条时给出下一页游标", () => {
    expect(pageOf(rows, 2, String)).toEqual({ page: [1, 2], nextCursor: "2" });
  });

  it("没有更多时不给游标", () => {
    expect(pageOf(rows, 3, String)).toEqual({ page: rows, nextCursor: null });
  });
});
