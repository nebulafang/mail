"use client";

import { AnimatePresence, m, useAnimate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator } from "@/design-system/atoms";
import { haptic } from "@/design-system/haptics";
import { gesture, presets, springs, toastMotion, toastStack } from "@/design-system/motion";
import { springTiming } from "@/design-system/timing";
import { useEnvironment } from "@/environment/environment";
import { usePan } from "@/hooks/use-pan";
import { usePresentation, type ToastItem, type ToastStatus } from "@/presentation/store";
import { cn } from "@/lib/utils";

const { maxVisible: MAX_VISIBLE, peek: PEEK, gap: GAP } = toastStack;

export function ToastStack() {
  const toasts = usePresentation((s) => s.toasts);
  const [expanded, setExpanded] = useState(false);
  const [held, setHeld] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  if (expanded && toasts.length <= 1) setExpanded(false);
  const visible = toasts.slice(0, expanded ? toasts.length : MAX_VISIBLE);

  const heightOf = (id: string) => heights[id] ?? toastStack.estimatedHeight;
  const frontHeight = visible[0] ? heightOf(visible[0].id) : 0;
  const layout = visible.map((t, index) => {
    const above = visible.slice(0, index).reduce((sum, prev) => sum + heightOf(prev.id) + GAP, 0);
    const y = expanded ? above : index === 0 ? 0 : frontHeight - heightOf(t.id) + index * PEEK;
    return { y, scale: expanded || index === 0 ? 1 : 1 - index * toastStack.stackScaleStep };
  });

  return (
    <>
      {expanded && (
        <div
          data-presentation-layer
          aria-hidden
          className="fixed inset-0 z-(--z-toast-backdrop)"
          onClick={() => setExpanded(false)}
        />
      )}
      <section
        data-presentation-layer
        aria-label="通知"
        className="pointer-events-none fixed inset-x-0 top-0 z-(--z-toast) flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+var(--space-2))]"
      >
        <div className="relative isolate w-full max-w-(--toast-max-w)">
          <AnimatePresence initial={false}>
            {visible.map((toast, index) => (
              <ToastCard
                key={toast.id}
                toast={toast}
                index={index}
                count={visible.length}
                y={layout[index].y}
                scale={layout[index].scale}
                stacked={!expanded && index > 0}
                paused={expanded || held}
                onHeight={(h) => setHeights((prev) => (prev[toast.id] === h ? prev : { ...prev, [toast.id]: h }))}
                onHold={setHeld}
                onTap={() => toasts.length > 1 && setExpanded((v) => !v)}
                onPullDown={() => toasts.length > 1 && setExpanded(true)}
                onPushUp={() => expanded && setExpanded(false)}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}

function ToastCard({
  toast,
  index,
  count,
  y,
  scale,
  stacked,
  paused,
  onHeight,
  onHold,
  onTap,
  onPullDown,
  onPushUp,
}: {
  toast: ToastItem;
  index: number;
  count: number;
  y: number;
  scale: number;
  stacked: boolean;
  paused: boolean;
  onHeight: (height: number) => void;
  onHold: (held: boolean) => void;
  onTap: () => void;
  onPullDown: () => void;
  onPushUp: () => void;
}) {
  const removeToast = usePresentation((s) => s.removeToast);
  const ref = useRef<HTMLDivElement>(null);
  const [content, animateContent] = useAnimate<HTMLDivElement>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (toast.status === "success") haptic("success");
    if (toast.status === "error") haptic("error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [firstVersion] = useState(toast.version);
  useEffect(() => {
    const el = content.current;
    if (toast.version === firstVersion || !el) return;
    animateContent(el, { scale: toastMotion.bumpScale }, springs.press).then(() =>
      animateContent(el, { scale: 1 }, springs.bouncy),
    );
    if (toast.status === "success") haptic("success");
    if (toast.status === "error") haptic("error");
  }, [toast.version, toast.status, firstVersion, content, animateContent]);

  useEffect(() => {
    if (paused || !Number.isFinite(toast.duration)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => (timer = setTimeout(() => removeToast(toast.id), toast.duration));
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paused, toast.id, toast.duration, toast.version, removeToast]);

  const recoil = useRef<Animation | null>(null);

  usePan(ref, {
    axis: "y",
    slop: 3,
    enabled: !stacked,
    onStart: () => {
      recoil.current?.cancel();
      onHold(true);
    },
    onMove: ({ dy }) => {
      if (ref.current) ref.current.style.translate = `0 ${dy * (dy < 0 ? 0.9 : 0.2)}px`;
    },
    onEnd: ({ dy, vy, canceled }) => {
      onHold(false);
      if (!canceled && (dy < gesture.toast.dismissDistance || vy < gesture.toast.dismissVelocity)) {
        if (index === 0) onPushUp();
        removeToast(toast.id);
        return;
      }
      const el = ref.current;
      if (el) {
        const from = el.style.translate || "0 0";
        el.style.translate = "";
        recoil.current = el.animate([{ translate: from }, { translate: "0 0" }], springTiming("snappy"));
      }
      if (!canceled && dy > gesture.toast.expandDistance) onPullDown();
    },
    onTap,
  });

  return (
    <m.div
      ref={ref}
      initial={toastMotion.enter}
      animate={{ y, scale, opacity: stacked ? Math.max(0, 1 - index * toastStack.stackFadeStep) : 1 }}
      exit={toastMotion.exit(y)}
      transition={springs.toast}
      onHoverStart={() => onHold(true)}
      onHoverEnd={() => onHold(false)}
      style={{ zIndex: count - index, originY: 1 }}
      className={cn(
        "lg lg-thick absolute inset-x-0 top-0 touch-none rounded-(--r-toast)",
        stacked ? "pointer-events-none" : "pointer-events-auto cursor-grab active:cursor-grabbing",
      )}
      role={toast.status === "error" ? "alert" : "status"}
      aria-live={toast.status === "error" ? "assertive" : "polite"}
      aria-atomic
    >
      <div ref={content} className="flex min-h-(--toast-min-h) items-center gap-3 py-3 pr-4 pl-3.5">
        <StatusIcon status={toast.status} />
        <div className={cn("min-w-0 flex-1 transition-opacity duration-(--dur-fade) ease-(--curve-out)", stacked && "opacity-0")}>
          <div className="type-subheadline font-semibold text-label">{toast.title}</div>
          {toast.description && <div className="line-clamp-2 type-footnote break-all text-label-2">{toast.description}</div>}
        </div>
        {toast.action && !stacked && (
          <button
            type="button"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toast.action!.onClick();
              removeToast(toast.id);
            }}
            className="pressable hit-area h-(--control-h-sm) shrink-0 rounded-full bg-fill-3 px-3.5 type-subheadline font-semibold text-tint"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </m.div>
  );
}

const statusColor: Record<ToastStatus, string> = {
  default: "",
  success: "bg-ios-green",
  error: "bg-ios-red",
  warning: "bg-ios-orange",
  info: "bg-tint",
  loading: "bg-fill-3",
};

function StatusIcon({ status }: { status: ToastStatus }) {
  if (status === "default") return null;
  return (
    <div className="relative grid size-8 shrink-0 place-items-center" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={status}
          {...presets.statusIcon}
          className={cn("grid size-8 place-items-center rounded-full text-on-color", statusColor[status])}
        >
          {status === "loading" ? <ActivityIndicator size={20} /> : <Glyph status={status} />}
        </m.span>
      </AnimatePresence>
    </div>
  );
}

function Glyph({ status }: { status: Exclude<ToastStatus, "default" | "loading"> }) {
  const { reduceMotion } = useEnvironment();
  const draw = (delay = 0.12) =>
    reduceMotion ? { initial: false as const } : { ...presets.draw, transition: { ...presets.draw.transition, delay } };
  const dot = (delay: number) => (reduceMotion ? { initial: false as const } : { ...presets.checkmark, transition: { ...springs.bouncy, delay } });
  return (
    <svg viewBox="0 0 24 24" className="size-(--icon-sm)" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      {status === "success" && <m.path d="M5 12.5l4.5 4.5L19 7.5" {...draw()} />}
      {status === "error" && (
        <>
          <m.path d="M7 7l10 10" {...draw()} />
          <m.path d="M17 7L7 17" {...draw(0.24)} />
        </>
      )}
      {status === "warning" && (
        <>
          <m.path d="M12 6v8" {...draw()} />
          <m.circle cx="12" cy="18.5" r="0.8" fill="currentColor" {...dot(0.3)} />
        </>
      )}
      {status === "info" && (
        <>
          <m.circle cx="12" cy="6" r="0.8" fill="currentColor" {...dot(0.1)} />
          <m.path d="M12 10.5v8" {...draw(0.18)} />
        </>
      )}
    </svg>
  );
}
