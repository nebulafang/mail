import { DAY_MS } from "./time";

export const SHARE_ROLES = ["viewer", "editor", "manager"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export type MailboxRole = "owner" | ShareRole;
export type AccessRole = MailboxRole | null;

export type MailboxAbility = "read" | "organize" | "members" | "activity" | "note" | "renew" | "permanent" | "delete" | "link";

export const MAX_SHARE_BATCH = 20;
export const MAX_MAILBOX_MEMBERS = 50;
export const MAX_SHARE_DAYS = 365;

export const ROLE_INFO: Record<ShareRole, { label: string; description: string }> = {
  viewer: { label: "只读", description: "查看邮件和附件，不能做任何修改" },
  editor: { label: "可整理", description: "还能标记已读、删除邮件和清空收件箱" },
  manager: { label: "可管理", description: "还能邀请或移除成员、修改备注和有效期" },
};

const ROLE_RANK: Record<MailboxRole, number> = { viewer: 1, editor: 2, manager: 3, owner: 4 };

const ABILITIES: Record<MailboxRole | "public", readonly MailboxAbility[]> = {
  public: ["read", "organize", "renew", "delete"],
  viewer: ["read"],
  editor: ["read", "organize"],
  manager: ["read", "organize", "members", "activity", "note", "renew"],
  owner: ["read", "organize", "members", "activity", "note", "renew", "permanent", "delete", "link"],
};

export const ORGANIZE_ROLES: ShareRole[] = SHARE_ROLES.filter((role) => ABILITIES[role].includes("organize"));

export const isShareRole = (value: unknown): value is ShareRole => SHARE_ROLES.includes(value as ShareRole);

export function can(role: AccessRole, ability: MailboxAbility) {
  return ABILITIES[role ?? "public"].includes(ability);
}

export const roleWithin = (role: ShareRole, max: ShareRole) => ROLE_RANK[role] <= ROLE_RANK[max];

export function canAssign(actor: AccessRole, role: ShareRole) {
  return !!actor && can(actor, "members") && ROLE_RANK[role] <= ROLE_RANK[actor];
}

export type ShareTargetProblem = "self" | "owner" | "member" | "pending" | "missing";

export const TARGET_PROBLEM_MESSAGE: Record<ShareTargetProblem, string> = {
  self: "不能分享给自己",
  owner: "对方是这个邮箱的主人",
  member: "对方已经是成员",
  pending: "已经邀请过对方，等待接受",
  missing: "没有找到这个用户",
};

export function shareTargetProblem(
  target: { id: string; disabled: boolean } | undefined,
  viewerId: string,
  ownerId: string,
  existing: { status: "pending" | "active"; expiresAt: Date | null } | undefined,
  now = new Date(),
): ShareTargetProblem | null {
  if (!target || target.disabled) return "missing";
  if (target.id === viewerId) return "self";
  if (target.id === ownerId) return "owner";
  if (existing && (!existing.expiresAt || existing.expiresAt > now)) return existing.status === "active" ? "member" : "pending";
  return null;
}

export function memberAlive(member: { expiresAt: Date | null }, now = new Date()) {
  return !member.expiresAt || member.expiresAt > now;
}

export const SHARE_EXPIRY_PRESETS = [
  { id: "mailbox", label: "随邮箱", days: null },
  { id: "1d", label: "1 天", days: 1 },
  { id: "7d", label: "7 天", days: 7 },
  { id: "30d", label: "30 天", days: 30 },
] as const;

export type ShareExpiryPreset = (typeof SHARE_EXPIRY_PRESETS)[number]["id"];

export const DEFAULT_LINK_EXPIRY: ShareExpiryPreset = "7d";
export const EXPIRED_LINK_GRACE_DAYS = 30;
export type LinkState = "off" | "active" | "expired";

export function linkState(token: string | null | undefined, expiresAt: string | Date | null | undefined, now = Date.now()): LinkState {
  if (!token) return "off";
  return expiresAt && new Date(expiresAt).getTime() <= now ? "expired" : "active";
}

export function presetToDate(preset: ShareExpiryPreset, now = Date.now()) {
  const days = SHARE_EXPIRY_PRESETS.find((p) => p.id === preset)?.days;
  return days ? new Date(now + days * DAY_MS).toISOString() : null;
}

export function shareExpiryProblem(value: string | null, now = Date.now()) {
  if (value === null) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return "有效期格式不正确";
  if (at <= now) return "有效期需要晚于现在";
  if (at > now + MAX_SHARE_DAYS * DAY_MS) return `有效期最长 ${MAX_SHARE_DAYS} 天`;
  return null;
}
