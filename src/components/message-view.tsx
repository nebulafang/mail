"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, FileCode2, Mail, MailOpen, MailX, Paperclip, Share2, Trash2 } from "lucide-react";
import { animate, m, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionLinkCard } from "@/components/action-link";
import { Attachments } from "@/components/attachments";
import { CodeCard } from "@/components/code-copy";
import { MessageBody } from "@/components/message-body";
import { MenuButton } from "@/components/menu-button";
import { MessageSource } from "@/components/message-source";
import { Screen, ToolbarGroup } from "@/components/screen";
import { ContentUnavailable } from "@/components/states";
import { Avatar, IconButton, Skeleton } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { presets, springs } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { usePan } from "@/hooks/use-pan";
import { formatBytes, formatFullTime, formatRelative } from "@/lib/format";
import { findActionLink } from "@/lib/mail-links";
import { present } from "@/presentation/api";
import type { MenuPointer } from "@/presentation/store";
import type { MessageDetail } from "@/services/mail";
import { copyWithToast } from "@/presentation/copy";

export type MessageViewModel = {
  message: MessageDetail | undefined;
  error: Error | null;
  recipient: string | undefined;
  toggleSeen?: () => void;
  goPrev?: () => void;
  goNext?: () => void;
  onDelete?: () => void;
  attachmentHref?: (id: string) => string;
  aside?: React.ReactNode;
};

const SWIPE_DISTANCE = 96;
const SWIPE_VELOCITY = 520;

let enterFrom = 0;

export function MessageDetailScreen({ model }: { model: MessageViewModel }) {
  const { message, toggleSeen, goPrev, goNext } = model;

  const go = (dir: -1 | 1) => {
    const fn = dir < 0 ? goPrev : goNext;
    if (!fn) return;
    haptic("selection");
    enterFrom = dir;
    fn();
  };

  async function more(anchor: HTMLElement, pointer?: MenuPointer) {
    if (!message) return;
    const canShare = typeof navigator !== "undefined" && !!navigator.share;
    const picked = await present.menu({
      anchor,
      pointer,
      sections: [
        {
          items: [
            { id: "source", label: "查看邮件原文", icon: FileCode2 },
            { id: "sender", label: "复制发件人地址", icon: Copy },
            ...(message.text ? [{ id: "text", label: "复制正文", icon: Copy }] : []),
            ...(canShare ? [{ id: "share", label: "分享", icon: Share2 }] : []),
          ],
        },
      ],
    });
    if (picked === "source") present.sheet({ title: "邮件原文", content: <MessageSource message={message} recipient={model.recipient} /> });
    if (picked === "sender") copyWithToast("发件人地址", message.fromAddress);
    if (picked === "text" && message.text) copyWithToast("正文", message.text);
    if (picked === "share") {
      navigator.share({ title: message.subject, text: `${message.subject}\n\n${message.text ?? ""}`.slice(0, 4000) }).catch(() => {});
    }
  }

  return (
    <Screen
      title={message?.subject || "邮件"}
      titleDisplay="reveal"
      trailing={
        <ToolbarGroup>
          <IconButton label="上一封" variant="plain" disabled={!goPrev} onClick={() => go(-1)}>
            <ChevronUp />
          </IconButton>
          <IconButton label="下一封" variant="plain" disabled={!goNext} onClick={() => go(1)}>
            <ChevronDown />
          </IconButton>
        </ToolbarGroup>
      }
      toolbar={
        !model.error && (
          <>
            {model.onDelete ? (
              <ToolbarGroup>
                <IconButton label="删除" variant="plain" disabled={!message} haptic="warning" onClick={model.onDelete}>
                  <Trash2 className="text-ios-red" />
                </IconButton>
              </ToolbarGroup>
            ) : (
              <span />
            )}
            <ToolbarGroup>
              {toggleSeen && (
                <IconButton label={message?.seen ? "标为未读" : "标为已读"} variant="plain" disabled={!message} onClick={toggleSeen}>
                  {message?.seen ? <Mail /> : <MailOpen />}
                </IconButton>
              )}
              <MenuButton label="更多" variant="plain" disabled={!message} onOpen={more} />
            </ToolbarGroup>
          </>
        )
      }
    >
      {model.error ? (
        <ContentUnavailable icon={<MailX />} title="邮件不存在" description="它可能已经被删除了" />
      ) : (
        <Swipeable key={message?.id ?? "loading"} canPrev={!!goPrev} canNext={!!goNext} onSwipe={go}>
          <MessageDetailContent message={message} recipient={model.recipient} attachmentHref={model.attachmentHref} aside={model.aside} />
        </Swipeable>
      )}
    </Screen>
  );
}

function Swipeable({
  canPrev,
  canNext,
  onSwipe,
  children,
}: {
  canPrev: boolean;
  canNext: boolean;
  onSwipe: (dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const { reduceMotion } = useEnvironment();
  const [from] = useState(() => enterFrom);
  useEffect(() => {
    enterFrom = 0;
  }, []);
  const x = useMotionValue(0);
  const armed = useMotionValue(0);
  const prevHint = useTransform(x, [0, SWIPE_DISTANCE], [0, 1]);
  const nextHint = useTransform(x, [-SWIPE_DISTANCE, 0], [1, 0]);
  const prevShift = useTransform(x, [0, SWIPE_DISTANCE], [-24, 0]);
  const nextShift = useTransform(x, [-SWIPE_DISTANCE, 0], [0, 24]);

  const surface = useRef<HTMLDivElement>(null);

  usePan(surface, {
    axis: "x",
    slop: 10,
    enabled: canPrev || canNext,
    onMove: ({ dx }) => {
      x.set(dx * ((dx > 0 ? canPrev : canNext) ? 0.5 : 0.08));
      const over = Math.abs(dx) > SWIPE_DISTANCE && (dx > 0 ? canPrev : canNext);
      if (over !== !!armed.get()) {
        armed.set(over ? 1 : 0);
        if (over) haptic("light");
      }
    },
    onEnd: ({ dx, vx, canceled }) => {
      const dir = dx > 0 ? -1 : 1;
      const allowed = dir < 0 ? canPrev : canNext;
      const passed = Math.abs(dx) > SWIPE_DISTANCE || Math.abs(vx) > SWIPE_VELOCITY;
      armed.set(0);
      if (!canceled && allowed && passed && Math.sign(vx || dx) === -dir) {
        animate(x, -dir * window.innerWidth * 0.6, { ...springs.dismiss, velocity: vx });
        onSwipe(dir);
      } else {
        animate(x, 0, springs.snappy);
      }
    },
  });

  return (
    <div className="relative overflow-x-clip">
      <m.div
        aria-hidden
        style={{ opacity: prevHint, x: prevShift }}
        className="pointer-events-none absolute top-24 left-2 z-(--z-raised) grid size-10 place-items-center rounded-full bg-fill-3 text-label-2"
      >
        <ChevronLeft className="size-5" strokeWidth={2.6} />
      </m.div>
      <m.div
        aria-hidden
        style={{ opacity: nextHint, x: nextShift }}
        className="pointer-events-none absolute top-24 right-2 z-(--z-raised) grid size-10 place-items-center rounded-full bg-fill-3 text-label-2"
      >
        <ChevronRight className="size-5" strokeWidth={2.6} />
      </m.div>
      <m.div
        ref={surface}
        initial={reduceMotion || !from ? false : { x: from * 56, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springs.push}
        style={{ x, touchAction: "pan-y" }}
        data-swipe-owner={canPrev ? "" : undefined}
        className="layer-keep"
      >
        {children}
      </m.div>
    </div>
  );
}

function MessageDetailContent({
  message,
  recipient,
  attachmentHref = (id) => `/api/attachments/${id}`,
  aside,
}: Pick<MessageViewModel, "message" | "recipient" | "attachmentHref" | "aside">) {
  const [fullTime, setFullTime] = useState(false);
  const link = useMemo(() => (message ? findActionLink(message.html, message.text) : null), [message]);
  const missing = useMemo(() => new Set(message?.attachments.filter((a) => a.inline && !a.saved).map((a) => a.id)), [message]);

  if (!message) {
    return (
      <div className="flex flex-col gap-4 px-(--margin) pt-2">
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-16 w-full rounded-(--r-card)" />
        <Skeleton className="h-72 w-full rounded-(--r-card)" />
      </div>
    );
  }

  const files = message.attachments.filter((a) => !a.inline);
  const sender = message.fromName || message.fromAddress;

  async function senderMenu() {
    const choice = await present.actionSheet({
      title: sender,
      message: message!.fromAddress,
      actions: [
        { id: "address", label: "复制发件人地址", icon: Copy },
        ...(message!.fromName ? [{ id: "name", label: "复制发件人名称", icon: Copy }] : []),
        ...(recipient ? [{ id: "to", label: "复制收件地址", icon: Copy }] : []),
      ],
    });
    if (choice === "address") copyWithToast("发件人地址", message!.fromAddress);
    if (choice === "name") copyWithToast("名称", message!.fromName!);
    if (choice === "to" && recipient) copyWithToast("收件地址", recipient);
  }

  return (
    <article className="flex flex-col gap-4 px-(--margin) pt-1 pb-4">
      <m.header {...presets.contentAppear} className="on-scene flex flex-col gap-2">
        <h1 className="type-title1 font-bold text-label select-text [overflow-wrap:anywhere]">{message.subject || "（无主题）"}</h1>
        <div className="flex flex-wrap items-center gap-1.5 type-footnote text-label-2">
          <button
            type="button"
            onClick={() => {
              haptic("selection");
              setFullTime(!fullTime);
            }}
            className="pressable rounded-full bg-fill-3 px-2 py-0.5 tabular-nums"
          >
            {fullTime ? formatFullTime(message.receivedAt) : formatRelative(message.receivedAt)}
          </button>
          <span className="rounded-full bg-fill-3 px-2 py-0.5 tabular-nums">{formatBytes(message.size)}</span>
          {files.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-fill-3 px-2 py-0.5">
              <Paperclip className="size-3" />
              {files.length}
            </span>
          )}
        </div>
      </m.header>

      <button
        type="button"
        onClick={senderMenu}
        className="mail-card pressable flex items-center gap-3 p-(--card-pad-sm) text-start"
      >
        <Avatar seed={message.fromAddress} text={sender} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate type-headline text-label">{sender}</span>
          <span className="block truncate type-footnote text-label-2">{message.fromName ? message.fromAddress : "发件人"}</span>
          {recipient && <span className="block truncate type-caption1 text-label-2">发送至 {recipient}</span>}
        </span>
        <ChevronRight className="size-(--chevron-size) shrink-0 text-chevron" strokeWidth={2.4} />
      </button>

      {aside}
      {message.code && <CodeCard code={message.code} />}
      {link && <ActionLinkCard link={link} />}

      <MessageBody html={message.html} text={message.text} missing={missing} />

      <Attachments files={files} hrefFor={attachmentHref} />

      <p className="pt-2 text-center type-caption1 text-label-2">{formatFullTime(message.receivedAt)} 收到</p>
    </article>
  );
}
