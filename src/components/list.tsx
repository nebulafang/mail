"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import { animate, type AnimationPlaybackControls, type Transition } from "motion/react";
import { useEffect, useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { gesture, springs } from "@/design-system/motion";
import { useFlipList } from "@/hooks/use-flip-list";
import { usePan } from "@/hooks/use-pan";
import { useNavigation } from "@/navigation/context";
import type { RouteTarget } from "@/navigation/types";
import { cn } from "@/lib/utils";

export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-(--section-gap) px-(--margin) pb-(--space-4)", className)}>{children}</div>;
}

export function Section({
  header,
  footer,
  children,
  className,
  variant = "card",
  appear,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: "grouped" | "card";
  appear?: boolean;
}) {
  const card = useFlipList<HTMLDivElement>();
  return (
    <section className={cn(appear && "view-card-in", className)}>
      {header && (
        <h2 className="on-scene mb-(--section-header-gap) px-(--section-header-inset) type-subheadline font-semibold text-label">{header}</h2>
      )}
      <div
        ref={card}
        className={cn(
          "focus-ring overflow-hidden [&>*:last-child_[data-sep]]:border-transparent",
          variant === "card" ? "mail-card" : "rounded-(--r-card) bg-surface",
        )}
      >
        {children}
      </div>
      {footer && <p className="on-scene mt-(--section-header-gap) px-(--section-header-inset) type-footnote text-label-2">{footer}</p>}
    </section>
  );
}

export type RowProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  detail?: React.ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  tint?: boolean;
  to?: RouteTarget;
  href?: string;
  onPress?: () => void;
  disabled?: boolean;
  multiline?: boolean;
  className?: string;
} & Pick<React.HTMLAttributes<HTMLElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onContextMenu" | "onClickCapture">;

export function Row({
  icon,
  title,
  subtitle,
  detail,
  chevron,
  destructive,
  tint,
  to,
  href,
  onPress,
  disabled,
  multiline,
  className,
  ...handlers
}: RowProps) {
  const nav = useNavigation();
  const interactive = !!(to || href || onPress);
  const showChevron = !href && (chevron ?? !!to);

  const content = (
    <>
      {icon}
      <div
        data-sep
        className="mr-(--row-pad-x) flex min-h-(--row-min-h) min-w-0 flex-1 items-center gap-2 border-b-(length:--hairline) border-separator py-(--row-pad-y)"
      >
        <div className="min-w-0 flex-1 text-start">
          <div
            className={cn(
              "type-body",
              !multiline && "truncate",
              destructive ? "text-ios-red" : tint ? "text-tint" : "text-label",
            )}
          >
            {title}
          </div>
          {subtitle && <div className={cn("type-subheadline text-label-2", !multiline && "truncate")}>{subtitle}</div>}
        </div>
        {detail !== undefined && detail !== null && (
          <div className="flex shrink-0 items-center gap-2 type-body text-label-2">{detail}</div>
        )}
        {showChevron && <ChevronRight className="-mr-1 size-(--chevron-size) shrink-0 text-chevron" strokeWidth={2.4} />}
        {href && <ArrowUpRight className="-mr-1 size-(--chevron-size) shrink-0 text-chevron" strokeWidth={2.4} />}
      </div>
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-(--row-pad-x) bg-surface pl-(--row-pad-x) outline-none focus-visible:bg-highlight",
    interactive && "row-highlight",
    disabled && "pointer-events-none opacity-40",
    className,
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" draggable={false} className={classes} {...handlers}>
        {content}
      </a>
    );
  }
  if (to) {
    return (
      <a
        href={nav.href(to)}
        draggable={false}
        onClick={(e) => {
          if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          nav.push(to, { source: e.currentTarget.closest<HTMLElement>("[data-zoom]") });
        }}
        className={classes}
        {...handlers}
      >
        {content}
      </a>
    );
  }
  if (onPress) {
    return (
      <button type="button" onClick={onPress} disabled={disabled} className={classes} {...handlers}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} {...handlers}>
      {content}
    </div>
  );
}

export type SwipeAction = {
  label: string;
  icon?: React.ReactNode;
  color: "red" | "blue" | "orange" | "gray" | "indigo";
  destructive?: boolean;
  onAction: () => void;
};

const { actionWidth: ACTION_W } = gesture.swipeRow;
const REVEAL_PX = 24;
const DISMISS_SPEED = 2400;
const DISMISS_MIN_S = 0.12;
const DISMISS_MAX_S = 0.26;

export function SwipeActions({
  trailing = [],
  leading = [],
  children,
}: {
  trailing?: SwipeAction[];
  leading?: SwipeAction[];
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trailingFill = useRef<HTMLDivElement>(null);
  const trailingBar = useRef<HTMLDivElement>(null);
  const leadingFill = useRef<HTMLDivElement>(null);
  const leadingBar = useRef<HTMLDivElement>(null);
  const motion = useRef<{ x: number; from: number; width: number; armed: boolean; spring: AnimationPlaybackControls | null }>({
    x: 0,
    from: 0,
    width: 0,
    armed: false,
    spring: null,
  });
  const trailingW = trailing.length * ACTION_W;
  const leadingW = leading.length * ACTION_W;
  const hasTrailing = trailing.length > 0;
  const hasLeading = leading.length > 0;

  const show = (el: HTMLElement | null, opacity: number, shift: number) => {
    if (!el) return;
    el.style.opacity = String(opacity);
    el.style.transform = `translate3d(${shift}px, 0, 0)`;
  };

  const apply = (v: number) => {
    const state = motion.current;
    state.x = v;
    if (contentRef.current) contentRef.current.style.transform = v ? `translate3d(${v}px, 0, 0)` : "";
    const trailingOpacity = Math.min(1, Math.max(0, -v / REVEAL_PX));
    const leadingOpacity = Math.min(1, Math.max(0, v / REVEAL_PX));
    show(trailingFill.current, trailingOpacity, (state.width || trailingW) + v);
    show(trailingBar.current, trailingOpacity, Math.max(0, trailingW + v));
    show(leadingFill.current, leadingOpacity, v - (state.width || leadingW));
    show(leadingBar.current, leadingOpacity, Math.min(0, v - leadingW));
    rowRef.current?.toggleAttribute("data-swipe-owner", hasLeading || v !== 0);
  };

  const glide = (to: number, transition: Transition) => {
    const state = motion.current;
    state.spring?.stop();
    const controls = animate(state.x, to, { ...transition, onUpdate: apply });
    state.spring = controls;
    return controls;
  };
  const settle = (to: number, velocity = 0) => glide(to, { ...springs.snappy, velocity });

  const run = async (action: SwipeAction, velocity = 0) => {
    const row = rowRef.current;
    const { x } = motion.current;
    haptic(action.destructive ? "medium" : "light");
    if (action.destructive && row) {
      const to = x <= 0 ? -row.offsetWidth : row.offsetWidth;
      const speed = Math.max(Math.abs(velocity), DISMISS_SPEED);
      const duration = Math.min(DISMISS_MAX_S, Math.max(DISMISS_MIN_S, Math.abs(to - x) / speed));
      await glide(to, { type: "tween", ease: "linear", duration });
      action.onAction();
      return;
    }
    action.onAction();
    settle(0);
  };

  usePan(contentRef, {
    axis: "x",
    slop: 10,
    enabled: hasTrailing || hasLeading,
    onStart: () => {
      const state = motion.current;
      state.spring?.stop();
      state.from = state.x;
      state.armed = false;
      state.width = rowRef.current?.offsetWidth ?? 0;
    },
    onMove: ({ dx }) => {
      const state = motion.current;
      const { elastic, fullSwipeTrailing, fullSwipeLeading } = gesture.swipeRow;
      const min = hasTrailing ? -trailingW * 3 : 0;
      const max = hasLeading ? leadingW * 3 : 0;
      const raw = state.from + dx;
      const next =
        raw < min ? min + (hasTrailing ? (raw - min) * elastic : 0) : raw > max ? max + (hasLeading ? (raw - max) * elastic : 0) : raw;
      apply(next);
      const past = (hasTrailing && next < -state.width * fullSwipeTrailing) || (hasLeading && next > state.width * fullSwipeLeading);
      if (past !== state.armed) {
        state.armed = past;
        if (past) haptic("medium");
      }
    },
    onEnd: ({ vx }) => {
      const { x, width } = motion.current;
      const { fullSwipeTrailing, fullSwipeLeading, flickVelocity } = gesture.swipeRow;
      if (hasTrailing && x < -width * fullSwipeTrailing) return void run(trailing[0], vx);
      if (hasLeading && x > width * fullSwipeLeading) return void run(leading[0], vx);
      if (x < 0) settle(x < -trailingW / 2 || vx < -flickVelocity ? -trailingW : 0, vx);
      else settle(x > leadingW / 2 || vx > flickVelocity ? leadingW : 0, vx);
    },
  });

  useEffect(() => () => motion.current.spring?.stop(), []);

  return (
    <div ref={rowRef} data-swipe-owner={hasLeading ? "" : undefined} className="relative overflow-hidden">
      {hasTrailing && (
        <>
          <div ref={trailingFill} aria-hidden style={{ background: `var(--ios-${trailing[0].color})` }} className="absolute inset-0 opacity-0" />
          <div ref={trailingBar} style={{ width: trailingW }} className="absolute inset-y-0 right-0 flex flex-row-reverse opacity-0">
            {trailing.map((a) => (
              <ActionButton key={a.label} action={a} onClick={() => run(a)} />
            ))}
          </div>
        </>
      )}
      {hasLeading && (
        <>
          <div ref={leadingFill} aria-hidden style={{ background: `var(--ios-${leading[0].color})` }} className="absolute inset-0 opacity-0" />
          <div ref={leadingBar} style={{ width: leadingW }} className="absolute inset-y-0 left-0 flex opacity-0">
            {leading.map((a) => (
              <ActionButton key={a.label} action={a} onClick={() => run(a)} />
            ))}
          </div>
        </>
      )}
      <div
        ref={contentRef}
        onClickCapture={(e) => {
          if (motion.current.x === 0) return;
          e.preventDefault();
          e.stopPropagation();
          settle(0);
        }}
        className="relative touch-pan-y bg-surface"
      >
        {children}
      </div>
    </div>
  );
}

function ActionButton({ action, onClick }: { action: SwipeAction; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: `var(--ios-${action.color})` }}
      className="flex w-(--swipe-action-w) shrink-0 flex-col items-center justify-center gap-1 type-caption1 font-medium text-on-color [&_svg]:size-5"
    >
      {action.icon}
      {action.label}
    </button>
  );
}
