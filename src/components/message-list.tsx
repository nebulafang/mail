"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, Check, ChevronRight, Copy, KeyRound, Mail, MailOpen, Trash2 } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CodeChip } from "@/components/code-copy";
import { SwipeActions } from "@/components/list";
import { useScreen } from "@/components/screen";
import { Avatar, Skeleton } from "@/design-system/atoms";
import { presets, scrollRanges } from "@/design-system/motion";
import { springTiming } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";
import { useLongPress } from "@/hooks/use-long-press";
import { formatListTime } from "@/lib/format";
import { createBaseline, detectArrivals } from "@/lib/new-mail";
import { cn, copyText } from "@/lib/utils";
import { useNavigation } from "@/navigation/context";
import type { RouteTarget } from "@/navigation/types";
import { present, toast } from "@/presentation/api";
import type { MessageListItem } from "@/services/mail";

type MessageListProps = {
  messages: MessageListItem[];
  targetFor: (message: MessageListItem) => RouteTarget;
  onDelete?: (messageId: string) => void;
  onToggleSeen?: (message: MessageListItem) => void;
  onEndReached?: () => void;
  selection?: { selected: Set<string>; onToggle: (id: string) => void };
};

type RowActions = {
  target: (message: MessageListItem) => RouteTarget;
  remove: (messageId: string) => void;
  toggleSeen: (message: MessageListItem) => void;
  select: (messageId: string) => void;
};

export function MessageList({ messages, targetFor, onDelete, onToggleSeen, onEndReached, selection }: MessageListProps) {
  "use no memo";
  const { scrollElement } = useScreen();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = listRef.current;
    const container = scrollElement;
    if (!el || !container) return;
    const update = () => setScrollMargin(untransformedOffsetTop(el) - untransformedOffsetTop(container));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container.firstElementChild ?? container);
    return () => observer.disconnect();
  }, [scrollElement]);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 104,
    overscan: 6,
    scrollMargin,
    getItemKey: (index) => messages[index].id,
  });

  const [listed, setListed] = useState(messages);
  const [shifting, setShifting] = useState(false);
  if (listed !== messages) {
    setListed(messages);
    if (rowsShifted(listed, messages)) setShifting(true);
  }
  useEffect(() => {
    if (!shifting) return;
    const timer = setTimeout(() => setShifting(false), Number(springTiming("list-remove").duration));
    return () => clearTimeout(timer);
  }, [shifting, listed]);

  const [seen] = useState(() => ({ ids: new Set(messages.map((m) => m.id)) }));
  useEffect(() => {
    seen.ids = new Set(messages.map((m) => m.id));
  }, [messages, seen]);

  const latest = useRef({ targetFor, onDelete, onToggleSeen, selection });
  useLayoutEffect(() => {
    latest.current = { targetFor, onDelete, onToggleSeen, selection };
  });
  const [actions] = useState<RowActions>(() => ({
    target: (message) => latest.current.targetFor(message),
    remove: (id) => latest.current.onDelete?.(id),
    toggleSeen: (message) => latest.current.onToggleSeen?.(message),
    select: (id) => latest.current.selection?.onToggle(id),
  }));

  const items = virtualizer.getVirtualItems();
  const lastVisible = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (onEndReached && lastVisible >= messages.length - 10) onEndReached();
  }, [lastVisible, messages.length, onEndReached]);

  return (
    <>
      <NewMailPill messages={messages} />
      <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const message = messages[item.index];
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className={cn(
                "absolute inset-x-0 top-0",
                shifting && "transition-transform duration-(--spring-list-remove-dur) ease-(--spring-list-remove) reduced:transition-none",
              )}
              style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
            >
              <MessageRow
                message={message}
                fresh={!seen.ids.has(message.id)}
                isLast={item.index === messages.length - 1}
                actions={actions}
                canDelete={!!onDelete}
                canToggleSeen={!!onToggleSeen}
                selecting={!!selection}
                selected={!!selection?.selected.has(message.id)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function rowsShifted(before: MessageListItem[], after: MessageListItem[]) {
  const appendedOnly = after.length >= before.length && before.every((m, i) => m.id === after[i].id);
  return !appendedOnly;
}

function untransformedOffsetTop(el: HTMLElement) {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

const MessageRow = memo(function MessageRow({
  message,
  fresh,
  isLast,
  actions,
  canDelete,
  canToggleSeen,
  selecting,
  selected,
}: {
  message: MessageListItem;
  fresh: boolean;
  isLast: boolean;
  actions: RowActions;
  canDelete: boolean;
  canToggleSeen: boolean;
  selecting: boolean;
  selected: boolean;
}) {
  const nav = useNavigation();
  const [insert] = useState(fresh);
  const copyWithToast = async (text: string, label: string) => {
    if (await copyText(text)) toast.success(`${label}已复制`);
  };

  const longPress = useLongPress(async (el, { pointer, fromScale }) => {
    const picked = await present.menu({
      anchor: el,
      pointer,
      preview: el,
      previewFromScale: fromScale,
      sections: [
        {
          items: [
            ...(message.code ? [{ id: "code", label: `复制验证码 ${message.code}`, icon: KeyRound }] : []),
            { id: "from", label: "复制发件人地址", icon: Copy },
            ...(canToggleSeen
              ? [{ id: "seen", label: message.seen ? "标为未读" : "标为已读", icon: message.seen ? Mail : MailOpen }]
              : []),
          ],
        },
        ...(canDelete ? [{ items: [{ id: "delete", label: "删除", icon: Trash2, role: "destructive" as const }] }] : []),
      ],
    });
    if (picked === "code") copyWithToast(message.code!, "验证码");
    if (picked === "from") copyWithToast(message.fromAddress, "发件人地址");
    if (picked === "seen") actions.toggleSeen(message);
    if (picked === "delete") actions.remove(message.id);
  });

  if (selecting) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={() => actions.select(message.id)}
        className="row-highlight flex w-full gap-1.5 overflow-hidden bg-surface pl-2 text-start outline-none focus-visible:bg-highlight"
      >
        <span className="select-slide-fade flex w-(--selection-col) shrink-0 items-center justify-center">
          <SelectionCircle selected={selected} />
        </span>
        <span className="select-slide flex min-w-0 flex-1 gap-1.5">
          <MessageRowContent message={message} isLast={isLast} />
        </span>
      </button>
    );
  }

  const target = actions.target(message);
  return (
    <div className={insert ? "list-insert" : undefined}>
      <SwipeActions
        trailing={
          canDelete
            ? [{ label: "删除", color: "red", icon: <Trash2 />, destructive: true, onAction: () => actions.remove(message.id) }]
            : []
        }
        leading={
          canToggleSeen
            ? [
                {
                  label: message.seen ? "未读" : "已读",
                  color: "blue",
                  icon: message.seen ? <Mail /> : <MailOpen />,
                  onAction: () => actions.toggleSeen(message),
                },
              ]
            : []
        }
      >
        <a
          href={nav.href(target)}
          draggable={false}
          onClick={(e) => {
            if (longPress.fired()) return e.preventDefault();
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            nav.push(target);
          }}
          {...longPress.handlers}
          className="row-highlight flex gap-1.5 bg-surface pl-2 outline-none focus-visible:bg-highlight"
        >
          <MessageRowContent message={message} isLast={isLast} interactive />
        </a>
      </SwipeActions>
    </div>
  );
});

function MessageRowContent({ message, isLast, interactive }: { message: MessageListItem; isLast: boolean; interactive?: boolean }) {
  return (
    <>
      <span className="mt-(--unread-dot-offset) flex w-3 shrink-0 justify-center">
        <span data-off={message.seen ? "" : undefined} className="pop-toggle size-(--unread-dot) rounded-full bg-tint" />
      </span>
      <span className="mt-3 mr-1.5 shrink-0">
        <Avatar seed={message.fromAddress} text={message.fromName || message.fromAddress} />
      </span>
      <div className={cn("min-w-0 flex-1 py-3 pr-4", !isLast && "border-b-(length:--hairline) border-separator")}>
        <div className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate type-body", message.seen ? "font-medium" : "font-semibold")}>
            {message.fromName || message.fromAddress}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 type-subheadline text-label-2">
            {formatListTime(message.receivedAt)}
            <ChevronRight className="size-4 text-chevron" strokeWidth={2.4} />
          </span>
        </div>
        {message.toAddress && <div className="truncate type-footnote text-label-2">发往 {message.toAddress}</div>}
        <div className="truncate type-subheadline text-label">{message.subject || "（无主题）"}</div>
        <div className="flex items-end gap-2">
          <div className="line-clamp-2 min-w-0 flex-1 type-subheadline text-label-2">
            {message.preview.trim() || "（无文本内容）"}
          </div>
          {message.code &&
            (interactive ? (
              <CodeChip code={message.code} className="mb-0.5" />
            ) : (
              <span className="mb-0.5 font-mono type-subheadline font-semibold text-tint">{message.code}</span>
            ))}
        </div>
      </div>
    </>
  );
}

function SelectionCircle({ selected }: { selected: boolean }) {
  return (
    <span className="stack size-(--selection-circle) place-items-center rounded-full border-(length:--selection-stroke) border-label-3">
      <span
        data-off={selected ? undefined : ""}
        className="pop-toggle -m-(--selection-stroke) grid size-(--selection-circle) place-items-center rounded-full bg-tint text-on-tint"
      >
        <Check className="size-3.5" strokeWidth={3.2} />
      </span>
    </span>
  );
}

function NewMailPill({ messages }: { messages: MessageListItem[] }) {
  const { scroller } = useScreen();
  const [baseline, setBaseline] = useState(() => createBaseline(messages));
  const [count, setCount] = useState(0);
  const [scrolledDown, setScrolledDown] = useState(false);
  const { reduceMotion } = useEnvironment();

  const change = detectArrivals(baseline, messages);
  if (change) {
    setBaseline(change.baseline);
    if (scrolledDown && change.arrivals) setCount(count + change.arrivals);
  }

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = el.scrollTop;
      setScrolledDown(y > scrollRanges.newMailShow);
      if (y < scrollRanges.newMailHide) setCount(0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scroller]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+var(--nav-bar-h)+var(--space-2))] z-(--z-floating) flex justify-center">
      <AnimatePresence>
        {count > 0 && (
          <m.button
            type="button"
            {...presets.pillIn}
            onClick={() => {
              scroller.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
              setCount(0);
            }}
            className="lg pressable pointer-events-auto flex h-(--control-h) items-center gap-1.5 rounded-full px-4 type-subheadline font-semibold text-tint"
          >
            <ArrowUp className="size-4" />
            {count} 封新邮件
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3 py-3.5 pr-4 pl-5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
