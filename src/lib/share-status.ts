import { linkState, type LinkState } from "./share-rules";
import { DAY_MS } from "./time";

export type MailboxSharing = {
  members: number;
  pending: number;
  link: LinkState;
  linkExpiresAt: string | null;
};

export type ShareState = "private" | "pending" | "shared";
export type ShareIcon = "lock" | "users" | "link";

export type ShareStatus = {
  state: ShareState;
  icon: ShareIcon;
  label: string;
  caption: string | null;
  notes: string[];
};

const LINK_SOON_MS = DAY_MS;

export function toMailboxSharing(
  counts: { active: number; pending: number } | undefined,
  token: string | null | undefined,
  linkExpiresAt: Date | string | null | undefined,
  now = Date.now(),
): MailboxSharing {
  const expiresAt = linkExpiresAt ? new Date(linkExpiresAt).toISOString() : null;
  return {
    members: Number(counts?.active ?? 0),
    pending: Number(counts?.pending ?? 0),
    link: linkState(token, expiresAt, now),
    linkExpiresAt: token ? expiresAt : null,
  };
}

export function shareStatus(sharing: MailboxSharing | null | undefined, now = Date.now()): ShareStatus {
  const members = sharing?.members ?? 0;
  const pending = sharing?.pending ?? 0;
  const link = sharing?.link ?? "off";
  const linkOn = link === "active";
  const shared = members > 0 || linkOn;

  const notes = [
    pending > 0 ? `${pending} 人待接受` : null,
    link === "expired" ? "链接已过期" : null,
    linkOn && sharing?.linkExpiresAt && new Date(sharing.linkExpiresAt).getTime() - now < LINK_SOON_MS ? "链接即将到期" : null,
  ].filter((n): n is string => !!n);

  const caption = shared
    ? members > 0
      ? `共享 ${members} 人${linkOn ? " + 链接" : ""}`
      : "链接共享中"
    : pending > 0
      ? `${pending} 人待接受`
      : link === "expired"
        ? "链接已过期"
        : null;

  return {
    state: shared ? "shared" : pending > 0 ? "pending" : "private",
    icon: members > 0 ? "users" : linkOn ? "link" : "lock",
    label: shared ? `你和${members > 0 ? ` ${members} 位成员` : ""}${members > 0 && linkOn ? "、" : ""}${linkOn ? "持有链接的人" : ""}可见` : "仅你可见",
    caption,
    notes,
  };
}
