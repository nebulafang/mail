import { isShareRole, type ShareRole } from "./share-rules";

export const SHARE_POLICY_KEY = "share_policy";
export const LOG_RETENTION_OPTIONS = [30, 90, 180, 365] as const;
export const ACCESS_LOG_DAYS = 30;

export type SharePolicy = { invites: boolean; links: boolean; maxRole: ShareRole; retentionDays: number };

export const DEFAULT_SHARE_POLICY: SharePolicy = { invites: true, links: true, maxRole: "manager", retentionDays: 180 };

export const POLICY_DISABLED_MESSAGE = {
  invites: "管理员已暂停邀请新成员",
  links: "管理员已关闭公开链接功能",
  locked: "这个邮箱的共享已被管理员冻结",
} as const;

export function readSharePolicy(value: unknown): SharePolicy {
  if (!value || typeof value !== "object") return { ...DEFAULT_SHARE_POLICY };
  const raw = value as Record<string, unknown>;
  const retention = Number(raw.retentionDays);
  return {
    invites: raw.invites !== false,
    links: raw.links !== false,
    maxRole: isShareRole(raw.maxRole) ? raw.maxRole : DEFAULT_SHARE_POLICY.maxRole,
    retentionDays: (LOG_RETENTION_OPTIONS as readonly number[]).includes(retention) ? retention : DEFAULT_SHARE_POLICY.retentionDays,
  };
}
