"use client";

import { CalendarClock, Copy, Infinity as InfinityIcon, Link2, Lock, LogOut, NotebookPen, Share, Timer, Trash2, Users } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";
import { CodeChip } from "@/components/code-copy";
import { Row, SwipeActions } from "@/components/list";
import { Avatar, Badge } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets } from "@/design-system/motion";
import { useLongPress } from "@/hooks/use-long-press";
import { isPermanent, type ExpiryUpdate } from "@/lib/config";
import { formatCapped, formatListTime, formatRemaining, isFreshCode } from "@/lib/format";
import { can, ROLE_INFO } from "@/lib/share-rules";
import { shareStatus, type ShareStatus } from "@/lib/share-status";
import { cn, copyText } from "@/lib/utils";
import { present, toast, toastError } from "@/presentation/api";
import { useMailboxNote, useUpdateMailbox, type MailboxItem } from "@/services/mail";
import { useMailboxAvatar } from "@/store/avatar";
import { editMailboxNote } from "./mailbox-note";

const EXPIRING_MS = 60 * 60 * 1000;
const ARRIVAL_MS = 60 * 1000;
const FLASH: KeyframeAnimationOptions = { duration: 900, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

const isExpiring = (expiresAt: string) => !isPermanent(expiresAt) && new Date(expiresAt).getTime() - Date.now() < EXPIRING_MS;

const sharedLabel = (owner: string, role: MailboxItem["role"]) =>
  `来自 ${owner}${role && role !== "owner" ? ` · ${ROLE_INFO[role].label}` : ""}`;

function OwnedShareIcon({ status }: { status: ShareStatus }) {
  const className = "mr-1 inline size-3.5 -translate-y-px";
  if (status.icon === "users") return <Users aria-label={status.label} className={cn(className, "text-tint")} />;
  if (status.icon === "link") return <Link2 aria-label={status.label} className={cn(className, "text-tint")} />;
  return <Lock aria-label="仅你可见" className={cn(className, "text-label-2")} />;
}

async function copyAddress(address: string) {
  if (await copyText(address)) toast.success("地址已复制", { description: address });
  else toast.error("复制失败");
}

async function shareAddress(address: string) {
  if (!navigator.share) return copyAddress(address);
  try {
    await navigator.share({ text: address });
  } catch (e) {
    if ((e as Error).name !== "AbortError") copyAddress(address);
  }
}

function useNewMail(latest: MailboxItem["latest"], onArrive: () => void) {
  const latestId = latest?.id;
  const receivedAt = latest?.receivedAt;
  const seenId = useRef(latestId);
  useEffect(() => {
    if (!latestId || latestId === seenId.current) return;
    seenId.current = latestId;
    if (!receivedAt || Date.now() - new Date(receivedAt).getTime() > ARRIVAL_MS) return;
    haptic("success");
    onArrive();
  }, [latestId, receivedAt, onArrive]);
}

function useMailboxMenu(mailbox: MailboxItem, onDelete: () => void) {
  const extend = useUpdateMailbox(mailbox.address);
  const { note, save, synced } = useMailboxNote(mailbox);
  const permanent = isPermanent(mailbox.expiresAt);
  const role = mailbox.role ?? null;

  function renew(expiry: ExpiryUpdate, label: string) {
    extend.mutate({ expiry }, {
      onSuccess: () => toast.success(label),
      onError: toastError,
    });
  }

  const longPress = useLongPress(async (el, { pointer, fromScale }) => {
    const picked = await present.menu({
      anchor: el,
      pointer,
      preview: el,
      previewFromScale: fromScale,
      sections: [
        {
          items: [
            { id: "copy", label: "复制地址", icon: Copy },
            ...(can(role, "members")
              ? [{ id: "share-users", label: "共享给用户", icon: Users }]
              : role
                ? []
                : [{ id: "share", label: "分享地址", icon: Share }]),
            { id: "note", label: note ? "编辑备注" : "添加备注", icon: NotebookPen },
          ],
        },
        ...(can(role, "renew")
          ? [
              {
                title: permanent ? "有效期：永久" : "延长有效期",
                items: [
                  { id: "1d", label: "延长到 1 天后", icon: Timer },
                  { id: "7d", label: "延长到 7 天后", icon: CalendarClock },
                  ...(can(role, "permanent")
                    ? [{ id: "permanent", label: permanent ? "取消永久" : "设为永久", icon: InfinityIcon, checked: permanent }]
                    : []),
                ],
              },
            ]
          : []),
        {
          items: [
            can(role, "delete")
              ? { id: "delete", label: "删除邮箱", icon: Trash2, role: "destructive" as const }
              : { id: "delete", label: "退出共享", icon: LogOut, role: "destructive" as const },
          ],
        },
      ],
    });
    if (picked === "copy") copyAddress(mailbox.address);
    if (picked === "share") shareAddress(mailbox.address);
    if (picked === "share-users") void import("./share-sheet").then((m) => m.presentShareSheet(mailbox.address));
    if (picked === "note") editMailboxNote(mailbox.address, note, save, synced);
    if (picked === "1d") renew("1d", "已延长到 1 天后过期");
    if (picked === "7d") renew("7d", "已延长到 7 天后过期");
    if (picked === "permanent") renew(permanent ? "7d" : "permanent", permanent ? "已取消永久，7 天后过期" : "已设为永久邮箱");
    if (picked === "delete") onDelete();
  });

  return { longPress, note };
}

export function MailboxCard({ mailbox, onDelete }: { mailbox: MailboxItem; onDelete: () => void }) {
  const avatar = useMailboxAvatar();
  const { longPress, note } = useMailboxMenu(mailbox, onDelete);
  const flash = useRef<HTMLDivElement>(null);
  const latest = mailbox.latest ?? null;
  const permanent = isPermanent(mailbox.expiresAt);

  useNewMail(latest, () => flash.current?.animate([{ opacity: 1 }, { opacity: 0 }], FLASH));

  const [local, domain] = mailbox.address.split("@");
  const unreadLatest = !!latest && !latest.seen;
  const showCode = !!latest?.code && (unreadLatest || isFreshCode(latest.receivedAt));
  const expiring = isExpiring(mailbox.expiresAt);
  const status = mailbox.owned ? shareStatus(mailbox.sharing) : null;

  return (
    <div className="view-card-in">
      <div data-zoom className="mail-card [&_[data-sep]]:border-transparent">
        <SwipeActions
          leading={[{ label: "复制", color: "blue", icon: <Copy />, onAction: () => copyAddress(mailbox.address) }]}
          trailing={[
            mailbox.sharedBy
              ? { label: "退出", color: "red", icon: <LogOut />, onAction: onDelete }
              : { label: "删除", color: "red", icon: <Trash2 />, onAction: onDelete },
          ]}
        >
          <div className="relative">
            <Row
              icon={<Avatar seed={mailbox.address} text={mailbox.address} src={avatar.src} />}
              chevron={false}
              title={
                <span className="flex items-baseline gap-2">
                  <span className={cn("min-w-0 flex-1 truncate", !note && "font-mono")}>
                    {status && <OwnedShareIcon status={status} />}
                    {mailbox.sharedBy && <Users aria-label="共享邮箱" className="mr-1 inline size-3.5 -translate-y-px text-ios-indigo" />}
                    {note ? (
                      <span className="font-semibold">{note}</span>
                    ) : (
                      <>
                        {local}
                        <span className="text-label-2">@{domain}</span>
                      </>
                    )}
                  </span>
                  {latest && (
                    <time dateTime={latest.receivedAt} className="shrink-0 type-footnote text-label-2 tabular-nums">
                      {formatListTime(latest.receivedAt)}
                    </time>
                  )}
                </span>
              }
              subtitle={
                <>
                  <span className={cn("block truncate", unreadLatest ? "font-semibold text-label" : latest ? "" : "text-label-2")}>
                    {latest ? `${latest.fromName || latest.fromAddress} · ${latest.subject || "（无主题）"}` : "等待新邮件…"}
                  </span>
                  <span className={cn("flex items-center gap-1 truncate type-caption1", expiring ? "text-ios-red" : "text-label-2")}>
                    {mailbox.sharedBy && (
                      <span className="shrink-0">
                        {sharedLabel(mailbox.sharedBy, mailbox.role)} ·
                      </span>
                    )}
                    {status?.caption && (
                      <span className={cn("shrink-0", status.state === "shared" && !expiring && "text-tint")}>{status.caption} ·</span>
                    )}
                    {note && <span className="truncate font-mono">{mailbox.address} ·</span>}
                    <span className="shrink-0">
                      {expiring ? "即将过期 · " : `${formatCapped(mailbox.total)} 封邮件 · `}
                      {permanent ? (
                        <span className="inline-flex items-center gap-0.5 text-tint">
                          <InfinityIcon className="size-3.5" strokeWidth={2.4} />
                          永久
                        </span>
                      ) : (
                        formatRemaining(mailbox.expiresAt)
                      )}
                    </span>
                  </span>
                </>
              }
              detail={
                <AnimatePresence mode="popLayout" initial={false}>
                  {showCode ? (
                    <m.span key={latest.id} {...presets.pillIn} className="flex">
                      <CodeChip code={latest.code!} />
                    </m.span>
                  ) : (
                    <Badge key="badge" count={mailbox.unread} color="tint" />
                  )}
                </AnimatePresence>
              }
              to={{ name: "mailbox", params: { address: mailbox.address } }}
              {...longPress.handlers}
            />
            <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 bg-tint-fill opacity-0" />
          </div>
        </SwipeActions>
      </div>
    </div>
  );
}
