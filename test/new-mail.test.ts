import { describe, expect, it } from "vitest";
import { createBaseline, detectArrivals, withNewMail, type MailBaseline } from "@/lib/new-mail";

const mail = (id: string, minute: number) => ({ id, receivedAt: new Date(Date.UTC(2026, 9, 2, 8, minute)).toISOString() });

const page = [mail("e", 50), mail("d", 40), mail("c", 30), mail("b", 20)];
const older = mail("a", 10);

function replay(start: MailBaseline, ...steps: { id: string; receivedAt: string }[][]) {
  let baseline = start;
  let arrivals = 0;
  for (const list of steps) {
    const change = detectArrivals(baseline, list);
    if (!change) continue;
    arrivals += change.arrivals;
    baseline = change.baseline;
  }
  return arrivals;
}

describe("新邮件提示", () => {
  it("顶部出现更新的邮件才算新邮件", () => {
    expect(replay(createBaseline(page), [mail("f", 55), ...page])).toBe(1);
    expect(replay(createBaseline(page), [mail("g", 58), mail("f", 55), ...page])).toBe(2);
  });

  it("删除一封后分页补进来的旧邮件不算新邮件", () => {
    const afterDelete = page.filter((m) => m.id !== "c");
    expect(replay(createBaseline(page), afterDelete, [...afterDelete, older])).toBe(0);
  });

  it("撤销删除、恢复原列表不算新邮件", () => {
    const afterDelete = page.filter((m) => m.id !== "d");
    expect(replay(createBaseline(page), afterDelete, page)).toBe(0);
  });

  it("标记已读不改变列表成员，不算新邮件", () => {
    expect(detectArrivals(createBaseline(page), page.map((m) => ({ ...m, seen: true })))).toBeNull();
  });

  it("加载更多的旧邮件不算新邮件", () => {
    expect(replay(createBaseline(page), [...page, older])).toBe(0);
  });

  it("空列表收到第一封邮件算新邮件", () => {
    expect(replay(createBaseline([]), [mail("a", 1)])).toBe(1);
  });

  it("删除后再来新邮件仍然只计一封", () => {
    const afterDelete = page.filter((m) => m.id !== "e");
    expect(replay(createBaseline(page), afterDelete, [mail("f", 55), ...afterDelete])).toBe(1);
  });
});

type Incoming = { id: string; fromAddress: string; fromName: string | null; subject: string; preview: string; code: string | null; seen: boolean; receivedAt: string };

describe("新邮件直接更新邮箱列表", () => {
  const latestAt = (minute: number) => new Date(Date.UTC(2026, 9, 2, 8, minute)).toISOString();
  const box = (address: string, minute: number | null, extra: Partial<{ total: number; unread: number }> = {}) => ({
    address,
    total: 1,
    unread: 0,
    latest: minute === null ? null : { id: `${address}-old`, fromAddress: "a@b.c", fromName: null, subject: "old", code: null, seen: true, receivedAt: latestAt(minute) },
    ...extra,
  });
  const incoming = (minute: number, id = "new"): Incoming => ({
    id,
    fromAddress: "x@y.z",
    fromName: null,
    subject: "hi",
    preview: "hi",
    code: "123456",
    seen: false,
    receivedAt: latestAt(minute),
  });

  it("计数加一，最新一封换成新信，并移到最前", () => {
    const list = [box("a@example.com", 30), box("b@example.com", 20, { total: 3, unread: 1 })];
    const next = withNewMail(list, "b@example.com", incoming(40))!;
    expect(next.map((m) => m.address)).toEqual(["b@example.com", "a@example.com"]);
    expect(next[0]).toMatchObject({ total: 4, unread: 2, latest: { id: "new", code: "123456" } });
    expect(list[1].total).toBe(3);
  });

  it("同一封信重复推送不重复计数", () => {
    const list = [box("a@example.com", 30)];
    const once = withNewMail(list, "a@example.com", incoming(40))!;
    expect(withNewMail(once, "a@example.com", incoming(40))).toBe(once);
  });

  it("比当前最新一封还旧的信只加计数，不改顺序", () => {
    const list = [box("a@example.com", 30), box("b@example.com", 20)];
    const next = withNewMail(list, "b@example.com", incoming(10, "late"))!;
    expect(next.map((m) => m.address)).toEqual(["a@example.com", "b@example.com"]);
    expect(next[1]).toMatchObject({ total: 2, unread: 1, latest: { id: "b@example.com-old" } });
  });

  it("列表里没有这个邮箱时返回 null，交给调用方重新拉取", () => {
    expect(withNewMail([box("a@example.com", null)], "z@example.com", incoming(1))).toBeNull();
  });
});
