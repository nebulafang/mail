import { describe, expect, it } from "vitest";
import {
  can,
  canAssign,
  presetToDate,
  shareExpiryProblem,
  shareTargetProblem,
  SHARE_ROLES,
  type AccessRole,
  type MailboxAbility,
} from "@/lib/share-rules";
import { describeShareEvent, splitUsernames } from "@/lib/share-text";
import { shareGrantSchema, shareUpdateSchema } from "@/lib/validation";

const matrix: [AccessRole, MailboxAbility[]][] = [
  [null, ["read", "organize", "renew", "delete"]],
  ["viewer", ["read"]],
  ["editor", ["read", "organize"]],
  ["manager", ["read", "organize", "members", "activity", "note", "renew"]],
  ["owner", ["read", "organize", "members", "activity", "note", "renew", "permanent", "delete", "link"]],
];
const everyAbility: MailboxAbility[] = ["read", "organize", "members", "activity", "note", "renew", "permanent", "delete", "link"];

describe("can", () => {
  it.each(matrix)("%s 只拥有规定的能力", (role, allowed) => {
    for (const ability of everyAbility) expect(can(role, ability), `${role}:${ability}`).toBe(allowed.includes(ability));
  });

  it("共享成员都不能删除邮箱、设为永久或管理公开链接", () => {
    for (const role of SHARE_ROLES) {
      expect(can(role, "delete")).toBe(false);
      expect(can(role, "permanent")).toBe(false);
      expect(can(role, "link")).toBe(false);
    }
  });
});

describe("canAssign", () => {
  it("主人可以授予任何角色", () => {
    for (const role of SHARE_ROLES) expect(canAssign("owner", role)).toBe(true);
  });
  it("管理者只能授予不高于自己的角色", () => {
    expect(canAssign("manager", "viewer")).toBe(true);
    expect(canAssign("manager", "manager")).toBe(true);
  });
  it("只读、可整理和公共邮箱访问者不能授予权限", () => {
    for (const actor of ["viewer", "editor", null] as const) for (const role of SHARE_ROLES) expect(canAssign(actor, role)).toBe(false);
  });
});

describe("shareTargetProblem", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  const target = { id: "u2", disabled: false };
  it("拒绝不存在或被禁用的用户", () => {
    expect(shareTargetProblem(undefined, "u1", "u1", undefined, now)).toBe("missing");
    expect(shareTargetProblem({ id: "u2", disabled: true }, "u1", "u1", undefined, now)).toBe("missing");
  });
  it("拒绝分享给自己和主人", () => {
    expect(shareTargetProblem({ id: "u1", disabled: false }, "u1", "u1", undefined, now)).toBe("self");
    expect(shareTargetProblem({ id: "u0", disabled: false }, "u1", "u0", undefined, now)).toBe("owner");
  });
  it("拒绝重复分享", () => {
    expect(shareTargetProblem(target, "u1", "u1", { status: "active", expiresAt: null }, now)).toBe("member");
    expect(shareTargetProblem(target, "u1", "u1", { status: "pending", expiresAt: null }, now)).toBe("pending");
  });
  it("已过期的旧授权可以重新分享", () => {
    expect(shareTargetProblem(target, "u1", "u1", { status: "active", expiresAt: new Date(now.getTime() - 1) }, now)).toBeNull();
  });
  it("正常用户通过", () => {
    expect(shareTargetProblem(target, "u1", "u1", undefined, now)).toBeNull();
  });
});

describe("有效期", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  it("预设换算成日期", () => {
    expect(presetToDate("mailbox", now)).toBeNull();
    expect(presetToDate("7d", now)).toBe("2026-10-09T00:00:00.000Z");
  });
  it("拒绝过去、过远和非法的时间", () => {
    expect(shareExpiryProblem(null, now)).toBeNull();
    expect(shareExpiryProblem("2026-10-01T00:00:00Z", now)).toMatch("晚于现在");
    expect(shareExpiryProblem("2028-10-01T00:00:00Z", now)).toMatch("最长");
    expect(shareExpiryProblem("abc", now)).toMatch("格式");
    expect(shareExpiryProblem("2026-10-03T00:00:00Z", now)).toBeNull();
  });
});

describe("请求校验", () => {
  it("默认最小权限并去重用户名", () => {
    const parsed = shareGrantSchema.parse({ usernames: ["Alice", "alice ", "bob"] });
    expect(parsed).toEqual({ usernames: ["alice", "bob"], role: "viewer", expiresAt: null });
  });
  it("限制批量数量和角色", () => {
    expect(shareGrantSchema.safeParse({ usernames: [] }).success).toBe(false);
    expect(shareGrantSchema.safeParse({ usernames: Array.from({ length: 21 }, (_, i) => `user${i}`) }).success).toBe(false);
    expect(shareGrantSchema.safeParse({ usernames: ["alice"], role: "owner" }).success).toBe(false);
  });
  it("修改请求至少包含一项", () => {
    expect(shareUpdateSchema.safeParse({}).success).toBe(false);
    expect(shareUpdateSchema.safeParse({ expiresAt: null }).success).toBe(true);
  });
});

describe("文案", () => {
  it("拆分批量粘贴的用户名", () => {
    expect(splitUsernames(" Alice, @bob；carol\nalice、dave ")).toEqual(["alice", "bob", "carol", "dave"]);
    expect(splitUsernames("  ")).toEqual([]);
  });

  it("描述审计事件", () => {
    expect(describeShareEvent({ action: "grant", actor: "amy", target: "bob", detail: { role: "editor" } })).toBe("amy 邀请了 bob（可整理）");
    expect(describeShareEvent({ action: "update", actor: "amy", target: "bob", detail: { from: "viewer", role: "manager" } })).toBe(
      "amy 把 bob 的权限从「只读」改为「可管理」",
    );
    expect(describeShareEvent({ action: "update", actor: "amy", target: "bob", detail: { from: "viewer", role: "viewer" } })).toBe(
      "amy 修改了 bob 的有效期",
    );
    expect(describeShareEvent({ action: "expire", actor: null, target: "bob", detail: null })).toBe("bob 的权限已到期");
  });
});
