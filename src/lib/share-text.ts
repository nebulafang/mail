import type { ShareAction, ShareEventDetail } from "../db/app-schema";
import { ROLE_INFO, type ShareRole } from "./share-rules";

const roleLabel = (role: ShareRole | undefined) => (role ? ROLE_INFO[role].label : "");

export function splitUsernames(raw: string) {
  return [...new Set(raw.split(/[\s,，;；、]+/).map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
}

export function describeShareEvent({
  action,
  actor,
  target,
  detail,
}: {
  action: ShareAction;
  actor: string | null;
  target: string | null;
  detail: ShareEventDetail | null;
}) {
  const who = actor ?? "系统";
  const whom = target ?? "某位用户";
  switch (action) {
    case "grant":
      return `${who} 邀请了 ${whom}（${roleLabel(detail?.role)}）`;
    case "update":
      return detail?.from && detail.role && detail.from !== detail.role
        ? `${who} 把 ${whom} 的权限从「${roleLabel(detail.from)}」改为「${roleLabel(detail.role)}」`
        : `${who} 修改了 ${whom} 的有效期`;
    case "revoke":
      return `${who} 移除了 ${whom}`;
    case "accept":
      return `${whom} 接受了邀请`;
    case "decline":
      return `${whom} 拒绝了邀请`;
    case "leave":
      return `${whom} 退出了共享`;
    case "expire":
      return `${whom} 的权限已到期`;
    case "link_on":
      return `${who} 开启了公开只读链接`;
    case "link_reset":
      return `${who} 重新生成了公开链接`;
    case "link_off":
      return `${who} 关闭了公开链接`;
    case "link_expiry":
      return `${who} 修改了公开链接的有效期`;
    case "link_expire":
      return "公开链接已到期";
    case "link_view":
      return "有人通过公开链接查看了收件箱";
    case "link_read":
      return detail?.subject ? `有人通过公开链接打开了「${detail.subject}」` : "有人通过公开链接打开了一封邮件";
    case "lock":
      return detail?.revoked ? `${who} 冻结了共享，并移除了 ${detail.revoked} 位成员` : `${who} 冻结了共享`;
    case "unlock":
      return `${who} 解除了共享冻结`;
    case "policy":
      return `${who} 修改了全站共享设置`;
  }
}
