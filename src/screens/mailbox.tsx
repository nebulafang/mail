"use client";

import { Check, ChevronRight, Clock, Copy, Eye, Inbox, Infinity as InfinityIcon, KeyRound, Link2, Lock, LogOut, MailOpen, NotebookPen, SearchX, Share, Trash2, Users } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CodeCard } from "@/components/code-copy";
import { Segmented } from "@/components/form";
import { List, Section } from "@/components/list";
import { MessageList, MessagesSkeleton } from "@/components/message-list";
import { Screen } from "@/components/screen";
import { ContentUnavailable, ErrorState } from "@/components/states";
import { Button, IconButton, Inset, LiveDot, Skeleton, TagBadge } from "@/design-system/atoms";
import { COPIED_MS, presets } from "@/design-system/motion";
import { EXPIRY_KEYS, EXPIRY_OPTIONS, isPermanent, type ExpiryUpdate } from "@/lib/config";
import { haptic } from "@/design-system/haptics";
import { formatListTime, formatRemaining, isFreshCode } from "@/lib/format";
import { can, ROLE_INFO, type AccessRole } from "@/lib/share-rules";
import { shareStatus, type MailboxSharing, type ShareStatus } from "@/lib/share-status";
import { useNavigation } from "@/navigation/context";
import type { ScreenProps } from "@/navigation/types";
import { MenuButton } from "@/components/menu-button";
import { present, toast, toastError } from "@/presentation/api";
import type { MenuPointer } from "@/presentation/store";
import { cn, copyText } from "@/lib/utils";
import { useWatchAddress } from "@/services/live";
import { useLiveState } from "@/services/live-state";
import {
  useClearMessages,
  useDeleteMailbox,
  useUndoableDeleteMessage,
  useMailbox,
  useMailboxNote,
  useMarkSeen,
  useMessages,
  useSavedMailboxes,
  useUpdateMailbox,
  type MessageItem,
} from "@/services/mail";
import { editMailboxNote } from "./mailbox-note";
import { useLeaveMailbox } from "@/services/share";
import { presentShareSheet } from "./share-sheet";

type Filter = "all" | "unread" | "code";

const matches = (m: MessageItem, q: string) =>
  [m.fromName, m.fromAddress, m.subject, m.preview, m.code].some((v) => v?.toLowerCase().includes(q));

export function MailboxScreen({ params }: ScreenProps) {
  const address = params.address.toLowerCase();
  useWatchAddress(address);
  const nav = useNavigation();
  const saved = useSavedMailboxes();
  const { data: mailbox, error, refetch: refetchMailbox } = useMailbox(address);
  const { data: messages, isLoading, error: listError, refetch: refetchMessages, loadMore } = useMessages(address);
  const markSeen = useMarkSeen(address);
  const updateMailbox = useUpdateMailbox(address);
  const deleteMailbox = useDeleteMailbox();
  const deleteMessage = useUndoableDeleteMessage(address);
  const clearMessages = useClearMessages(address);
  const leaveMailbox = useLeaveMailbox();
  const { note, save: saveNote, synced } = useMailboxNote(mailbox);
  const permanent = isPermanent(mailbox?.expiresAt);
  const role = mailbox?.role ?? null;
  const organize = !!mailbox && can(role, "organize");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useDeferredValue(query.trim().toLowerCase());
  const live = useLiveState((s) => s.connected);

  const latest = messages?.[0];
  const hero = latest?.code && (!latest.seen || isFreshCode(latest.receivedAt)) ? latest : undefined;
  const heroId = hero?.id;
  const heroSeen = useRef(heroId);
  useEffect(() => {
    if (!heroId || heroId === heroSeen.current) return;
    heroSeen.current = heroId;
    haptic("success");
  }, [heroId]);

  const unread = messages?.filter((m) => !m.seen).length ?? 0;
  const withCode = messages?.filter((m) => m.code).length ?? 0;
  const visible = messages?.filter(
    (m) => (filter === "all" || (filter === "unread" ? !m.seen : !!m.code)) && (!q || matches(m, q)),
  );

  const { addresses, add, isFull } = saved;
  useEffect(() => {
    if (mailbox && !mailbox.sharedBy && !isFull && !addresses.includes(mailbox.address)) add(mailbox.address);
  }, [mailbox, addresses, add, isFull]);

  const copyAddress = async () => {
    const ok = await copyText(address);
    if (ok) toast.success("地址已复制", { description: address });
    else toast.error("复制失败");
    return ok;
  };
  const shareAddress = async () => {
    if (!navigator.share) return copyAddress();
    await navigator.share({ text: address }).catch(() => {});
  };

  async function openMenu(anchor: HTMLElement, pointer?: MenuPointer) {
    const picked = await present.menu({
      anchor,
      pointer,
      sections: [
        {
          items: [
            { id: "copy", label: "复制地址", icon: Copy },
            ...(can(role, "members") ? [{ id: "share-users", label: "共享给用户", icon: Users }] : []),
            { id: "note", label: note ? "编辑备注" : "添加备注", icon: NotebookPen, disabled: !mailbox },
            ...(organize ? [{ id: "read-all", label: "全部标为已读", icon: MailOpen, disabled: !unread }] : []),
          ],
        },
        ...(mailbox && can(role, "renew")
          ? [
              {
                title: permanent ? "有效期：永久（可改回限时）" : "有效期（从现在开始计算）",
                items: [
                  ...EXPIRY_KEYS.map((k) => ({ id: `expiry:${k}`, label: EXPIRY_OPTIONS[k].label, icon: Clock })),
                  ...(can(role, "permanent")
                    ? [{ id: "expiry:permanent", label: "永久", icon: InfinityIcon, checked: permanent, disabled: permanent }]
                    : []),
                ],
              },
            ]
          : []),
        {
          items: [
            ...(organize
              ? [{ id: "clear", label: "清空收件箱", icon: Trash2, role: "destructive" as const, disabled: !messages?.length }]
              : []),
            mailbox?.sharedBy
              ? { id: "leave", label: "退出共享", icon: LogOut, role: "destructive" as const }
              : { id: "delete", label: "删除邮箱", icon: Trash2, role: "destructive" as const, disabled: !mailbox },
          ],
        },
      ],
    });
    if (picked === "copy") copyAddress();
    if (picked === "share-users") presentShareSheet(address);
    if (picked === "note" && mailbox) editMailboxNote(address, note, saveNote, synced);
    if (picked === "read-all") messages?.filter((m) => !m.seen).forEach((m) => markSeen.mutate({ id: m.id, seen: true }));
    if (picked?.startsWith("expiry:")) {
      const expiry = picked.slice(7) as ExpiryUpdate;
      toast.promise(updateMailbox.mutateAsync({ expiry }), {
        loading: "正在修改有效期…",
        success: expiry === "permanent" ? "已设为永久邮箱" : `有效期已改为${EXPIRY_OPTIONS[expiry].label}`,
        error: (e) => e.message,
      });
    }
    if (picked === "clear") {
      const ok = await present.actionSheet({
        title: `${messages?.length ?? 0} 封邮件和附件都会被永久删除`,
        actions: [{ id: "ok", label: "清空收件箱", role: "destructive" }],
      });
      if (ok === "ok") clearMessages.mutate(undefined, { onSuccess: () => toast.success("收件箱已清空") });
    }
    if (picked === "leave") {
      const ok = await present.actionSheet({
        title: `退出后将无法再查看这个邮箱，需要 ${mailbox?.sharedBy ?? "邮箱主人"} 重新邀请`,
        actions: [{ id: "ok", label: "退出共享", role: "destructive" }],
      });
      if (ok !== "ok") return;
      leaveMailbox.mutate(address, { onSuccess: () => toast.success("已退出共享"), onError: toastError });
      nav.pop();
    }
    if (picked === "delete") {
      const ok = await present.actionSheet({
        title: "邮箱和所有邮件都会被永久删除，地址也会被释放",
        actions: [{ id: "ok", label: "删除邮箱", role: "destructive" }],
      });
      if (ok !== "ok") return;
      deleteMailbox.mutate(address, { onSuccess: () => toast.success("邮箱已删除") });
      saved.remove(address);
      nav.pop();
    }
  }

  if (error) {
    return (
      <Screen title="收件箱">
        <ContentUnavailable
          icon={<Inbox />}
          title="邮箱不存在"
          description="它可能已经过期、被删除，或者共享给你的权限已被撤销"
          actions={
            <Button variant="gray" size="small" onClick={() => nav.pop()}>
              返回
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={note || "收件箱"}
      subtitle={messages ? (unread ? `${unread} 封未读` : `${messages.length} 封邮件`) : " "}
      trailing={
        <MenuButton label="更多操作" onOpen={openMenu} />
      }
      search={messages?.length ? { value: query, onChange: setQuery, placeholder: "搜索发件人、主题、验证码" } : undefined}
      refreshable={() => Promise.all([refetchMessages(), refetchMailbox()])}
      accessory={<CopyAccessory onCopy={copyAddress} />}
    >
      <List>
        {!q && (
          <AddressCard
            address={mailbox?.address}
            expiresAt={mailbox?.expiresAt}
            owned={!!mailbox?.owned}
            role={role}
            sharedBy={mailbox?.sharedBy ?? null}
            permanent={permanent}
            sharing={mailbox?.sharing ?? null}
            onManageShare={can(role, "members") ? () => presentShareSheet(address) : undefined}
            onCopy={copyAddress}
            onShare={can(role, "members") ? () => presentShareSheet(address) : role ? undefined : shareAddress}
          />
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {!q && hero?.code && (
            <m.div key={hero.id} {...presets.contentAppear}>
              <CodeCard
                code={hero.code}
                caption={`来自 ${hero.fromName || hero.fromAddress} · ${formatListTime(hero.receivedAt)}`}
              />
            </m.div>
          )}
        </AnimatePresence>

        {!!messages?.length && (
          <Inset className="-mb-3">
            <Segmented
              label="筛选"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "全部" },
                { value: "unread", label: unread ? `未读 ${unread}` : "未读" },
                { value: "code", label: withCode ? `验证码 ${withCode}` : "验证码" },
              ]}
            />
          </Inset>
        )}

        {isLoading ? (
          <Section variant="card">
            <MessagesSkeleton />
          </Section>
        ) : listError ? (
          <ErrorState message={listError.message} onRetry={() => refetchMessages()} />
        ) : !messages?.length ? (
          <ContentUnavailable
            tone="blue"
            icon={
              <span className="relative inline-grid">
                <Inbox />
                {live && <LiveDot className="absolute top-1 -right-1 size-3" />}
              </span>
            }
            title="正在等待新邮件"
            description={live ? "已连接实时通道，邮件到达后会立即出现在这里" : "发到上面地址的邮件会自动出现在这里，也可以下拉刷新"}
          />
        ) : !visible?.length ? (
          q ? (
            <ContentUnavailable icon={<SearchX />} title="没有匹配的邮件" description={`没有找到包含“${query.trim()}”的邮件`} />
          ) : (
            <ContentUnavailable
              icon={filter === "code" ? <KeyRound /> : <MailOpen />}
              title={filter === "code" ? "没有验证码邮件" : "全部已读"}
            />
          )
        ) : (
          <Section
            variant="card"
            header={q ? `找到 ${visible.length} 封` : undefined}
            footer={organize ? "左滑删除，右滑标为已读 / 未读，长按查看更多操作" : "你在这个共享邮箱里是只读权限"}
          >
            <MessageList
              messages={visible}
              targetFor={(m) => ({ name: "message", params: { address, messageId: m.id } })}
              onDelete={organize ? deleteMessage : undefined}
              onToggleSeen={organize ? (m) => markSeen.mutate({ id: m.id, seen: !m.seen }) : undefined}
              onEndReached={loadMore}
            />
          </Section>
        )}
      </List>
    </Screen>
  );
}

function CopyAccessory({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="复制地址"
      onClick={async () => {
        if (!(await onCopy())) return;
        haptic("success");
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      }}
      className={cn(
        "lg pressable grid size-full place-items-center rounded-full [--press-scale:var(--press-scale-tab)] [&_svg]:size-6",
        copied ? "lg-tinted" : "text-tint",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span key={copied ? "done" : "copy"} {...presets.iconSwap} className="grid place-items-center">
          {copied ? <Check strokeWidth={2.8} /> : <Copy strokeWidth={2.2} />}
        </m.span>
      </AnimatePresence>
    </button>
  );
}

const SHARE_ICONS = { lock: Lock, users: Users, link: Link2 } as const;

function ShareStatusLine({ status, onPress }: { status: ShareStatus; onPress?: () => void }) {
  const Icon = SHARE_ICONS[status.icon];
  const content = (
    <>
      <Icon className="size-3 shrink-0" strokeWidth={2.4} />
      <span>{status.label}</span>
      {status.notes.map((note) => (
        <span key={note} className="text-ios-orange">
          <span aria-hidden className="mr-1.5 text-label-2">·</span>
          {note}
        </span>
      ))}
    </>
  );
  const tone = status.state === "shared" ? "text-tint" : "text-label-2";
  if (!onPress) return <span className={cn("inline-flex flex-wrap items-center gap-1", tone)}>{content}</span>;
  return (
    <button
      type="button"
      aria-label={`${[status.label, ...status.notes].join("，")}，管理共享`}
      onClick={() => {
        haptic("selection");
        onPress();
      }}
      className={cn("press-fade inline-flex flex-wrap items-center gap-1 text-start outline-none focus-visible:underline", tone)}
    >
      {content}
      <ChevronRight className="size-3 shrink-0" strokeWidth={2.6} />
    </button>
  );
}

function AddressCard({
  address,
  expiresAt,
  owned,
  role,
  sharedBy,
  permanent,
  sharing,
  onManageShare,
  onCopy,
  onShare,
}: {
  address?: string;
  expiresAt?: string;
  owned: boolean;
  role: AccessRole;
  sharedBy: string | null;
  permanent: boolean;
  sharing: MailboxSharing | null;
  onManageShare?: () => void;
  onCopy: () => Promise<boolean>;
  onShare?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!address) {
    return (
      <Section variant="card">
        <div className="flex flex-col gap-3 p-(--card-pad)">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="mt-2 h-11 w-full rounded-full" />
        </div>
      </Section>
    );
  }
  const [local, domain] = address.split("@");

  return (
    <Section variant="card" className="view-card-in">
      <div className="p-(--card-pad) pb-4">
        <div className="flex flex-wrap items-center gap-1.5 type-footnote text-label-2">
          <LiveDot />
          正在接收
          <span aria-hidden>·</span>
          {permanent ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-tint">
              <InfinityIcon className="size-3.5" strokeWidth={2.4} />
              永久邮箱
            </span>
          ) : (
            formatRemaining(expiresAt ?? null)
          )}
          {owned && (
            <>
              <span aria-hidden>·</span>
              <ShareStatusLine status={shareStatus(sharing)} onPress={onManageShare} />
            </>
          )}
          {sharedBy && role && role !== "owner" && (
            <TagBadge color="indigo">
              {role === "viewer" ? <Eye className="size-3" strokeWidth={2.6} /> : <Users className="size-3" strokeWidth={2.6} />}
              {sharedBy} 共享 · {ROLE_INFO[role].label}
            </TagBadge>
          )}
        </div>
        <p className="mt-2 font-mono type-title2 break-all text-label select-text" aria-label={address}>
          {local}
          <span className="text-label-2">@{domain}</span>
        </p>
        <div className="mt-4 flex gap-2.5">
          <Button
            variant="prominent"
            fullWidth
            haptic="success"
            className="flex-1"
            onClick={async () => {
              if (!(await onCopy())) return;
              setCopied(true);
              setTimeout(() => setCopied(false), COPIED_MS);
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span key={copied ? "done" : "copy"} {...presets.iconSwap} className="flex items-center gap-2">
                {copied ? <Check strokeWidth={2.6} /> : <Copy />}
                {copied ? "已复制" : "复制地址"}
              </m.span>
            </AnimatePresence>
          </Button>
          {onShare && (
            <IconButton label={can(role, "members") ? "共享给用户" : "共享地址"} variant="gray" onClick={onShare}>
              {can(role, "members") ? <Users /> : <Share />}
            </IconButton>
          )}
        </div>
      </div>
    </Section>
  );
}
