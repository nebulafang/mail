"use client";

import { Menu } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import { animate, m } from "motion/react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { contextMenu, exitFallbackMs, fade, menuLayout, menuMorph, scales } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { releasePress } from "@/hooks/use-long-press";
import { useMenuDragSelect } from "@/hooks/use-menu-drag-select";
import { usePresence } from "./use-presence";
import {
  createItemClickGate,
  estimateMenuHeight,
  isScrollable,
  menuPlacement,
  NO_INSETS,
  visibleBounds,
  type Box,
  type Insets,
} from "@/presentation/menu-layout";
import { usePresentation, type MenuSection, type Presentation } from "@/presentation/store";
import { cn } from "@/lib/utils";

type MenuPresentation = Extract<Presentation, { kind: "menu" }>;

export function MenuView({ item }: { item: MenuPresentation }) {
  const { dismiss } = usePresentation.getState();
  const { anchor, sections, preview, pointer, previewFromScale = 1 } = item.options;
  const { reduceMotion } = useEnvironment();
  const presence = usePresence(item, exitFallbackMs.menu);
  const [rect] = useState(() => (anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect()));
  const bounds = useVisibleBounds();
  const [shift] = useState(() => (preview ? previewShift(rect, sections, bounds) : 0));
  const [placement] = useState(() =>
    preview ? "beside" : menuPlacement(rect, bounds, estimateMenuHeight(sections, contextMenu, fontScale()), menuLayout.sideOffset, menuLayout.collisionPadding),
  );
  const previewRect = preview ? translatedRect(scaledRect(rect, scales.lift), -shift) : null;
  const virtualAnchor = { getBoundingClientRect: () => previewRect ?? rect };
  const [alignEnd] = useState(() => {
    const frame = document.body.getBoundingClientRect();
    return (preview && pointer ? pointer.x : rect.left) > frame.left + frame.width / 2;
  });
  const previewEl = useRef<HTMLDivElement>(null);

  const panel = useRef<HTMLDivElement>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const scrollable = useScrollable(panelEl);
  const entered = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const [exited, setExited] = useState(false);
  const [opened, setOpened] = useState(false);
  if (presence.open && !opened) setOpened(true);
  const rootOpen = !exited && (presence.open || (!item.open && opened));

  const startScale = useCallback(
    (el: HTMLElement) => {
      const base = previewRect ?? rect;
      const sx = Math.min(base.width / el.offsetWidth, menuMorph.maxStartScale);
      const sy = Math.min((preview ? 0 : base.height) / el.offsetHeight, menuMorph.maxStartScale);
      return { scaleX: Math.max(sx, 0.05), scaleY: Math.max(sy, 0.05) };
    },
    [previewRect, rect, preview],
  );

  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      panel.current = el;
      setPanelEl(el);
      if (!el || entered.current) return;
      entered.current = true;
      if (reduceMotion) {
        animate(el, { opacity: [0, 1] }, fade);
        return;
      }
      const from = startScale(el);
      animate(el, { scaleX: [from.scaleX, 1], scaleY: [from.scaleY, 1], opacity: [0, 1] }, menuMorph.open);
      if (content.current) animate(content.current, { opacity: [0, 1] }, { ...menuMorph.open, delay: menuMorph.contentDelay });
    },
    [reduceMotion, startScale],
  );

  useEffect(() => {
    if (item.open || exited) return;
    const el = panel.current;
    const card = previewEl.current;
    const jobs: Promise<void>[] = [];
    if (el) jobs.push(settled(reduceMotion ? animate(el, { opacity: 0 }, fade) : animate(el, { ...startScale(el), opacity: 0 }, menuMorph.close)));
    if (card && preview) {
      card.style.willChange = "transform, opacity";
      const land = reduceMotion ? Promise.resolve() : settled(animate(card, { scale: 1, y: 0 }, contextMenu.settle));
      jobs.push(
        land.then(() => {
          setSourceVisible(preview, true);
          return settled(animate(card, { opacity: 0 }, contextMenu.handoff));
        }),
      );
    }
    Promise.all(jobs).then(() => {
      if (preview) setSourceVisible(preview, true);
      setExited(true);
    });
  }, [item.open, exited, reduceMotion, startScale, preview]);

  useEffect(() => () => void (preview && setSourceVisible(preview, true)), [preview]);

  const [clickGate] = useState(createItemClickGate);
  const drag = useMenuDragSelect({
    initial: pointer,
    enabled: item.open,
    onSelect: (id) => dismiss(item.id, id),
  });

  return (
    <>
      {preview && (
        <ContextPreview
          ref={previewEl}
          source={preview}
          rect={rect}
          open={presence.open}
          fromScale={previewFromScale}
          shift={shift}
          reduceMotion={reduceMotion}
        />
      )}
      <Menu.Root
        open={rootOpen}
        onOpenChange={(open) => !open && dismiss(item.id, null)}
        onOpenChangeComplete={presence.onOpenChangeComplete}
        modal
      >
      <Menu.Portal>
        <Menu.Positioner
          anchor={virtualAnchor}
          side="bottom"
          align={alignEnd ? "end" : "start"}
          sideOffset={preview ? menuLayout.sideOffsetWithPreview : menuLayout.sideOffset}
          collisionPadding={menuLayout.collisionPadding}
          collisionBoundary={bounds}
          collisionAvoidance={
            preview
              ? { side: "none", align: "shift", fallbackAxisSide: "none" }
              : placement === "overlap"
                ? { side: "shift", align: "shift", fallbackAxisSide: "none" }
                : undefined
          }
          className="z-(--z-menu) outline-none"
          data-presentation-layer
        >
          <Menu.Popup className="outline-none">
            <m.div
              ref={panelRef}
              onPointerDown={(e) => {
                clickGate.press();
                drag.onPointerDown(e, { scrollable });
              }}
              onClickCapture={(e) => {
                if (clickGate.allows(e.detail)) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              style={{ opacity: 0 }}
              data-scrollable={scrollable ? "" : undefined}
              className={cn(
                "lg lg-thick w-(--menu-w) origin-(--transform-origin) overflow-hidden overscroll-contain rounded-(--r-menu) py-1.5",
                scrollable ? "touch-pan-y" : "touch-none",
                preview && "lg-over-scrim",
                "max-h-[min(var(--available-height),var(--menu-max-h))] overflow-y-auto",
              )}
            >
              <div ref={content}>
                {sections.map((section, sectionIndex) => (
                  <Fragment key={sectionIndex}>
                    {sectionIndex > 0 && <div aria-hidden className="my-1.5 h-(--menu-section-gap) bg-fill-4" />}
                    <Menu.Group>
                      {section.title && (
                        <Menu.GroupLabel className="px-4 pt-1.5 pb-1 type-footnote text-label-2">{section.title}</Menu.GroupLabel>
                      )}
                      {section.items.map((entry, index) => {
                        const Icon = entry.icon;
                        return (
                          <Fragment key={entry.id}>
                            {index > 0 && <div aria-hidden className="ml-4 h-(--hairline) bg-separator" />}
                            <Menu.Item
                              data-menu-item={entry.id}
                              data-drag-over={drag.over === entry.id ? "" : undefined}
                              disabled={entry.disabled}
                              onClick={() => dismiss(item.id, entry.id)}
                              className={cn(
                                "flex min-h-(--hit) cursor-default items-center gap-3 px-4 py-2.5 type-body outline-none select-none",
                                "data-disabled:opacity-35 data-[drag-over]:bg-highlight",
                                !drag.dragging && "data-highlighted:bg-highlight",
                                entry.role === "destructive" ? "text-ios-red" : "text-label",
                              )}
                            >
                              <span className="grid w-4 shrink-0 place-items-center">
                                {entry.checked && <Check className="size-4" strokeWidth={2.6} />}
                              </span>
                              <span className="flex-1 truncate">{entry.label}</span>
                              {Icon && <Icon className="size-5 shrink-0" />}
                            </Menu.Item>
                          </Fragment>
                        );
                      })}
                    </Menu.Group>
                  </Fragment>
                ))}
              </div>
            </m.div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
      </Menu.Root>
    </>
  );
}

const settled = (controls: { then: (onResolve: () => void) => unknown }) => new Promise<void>((resolve) => void controls.then(resolve));

function setSourceVisible(el: HTMLElement, visible: boolean) {
  el.style.opacity = visible ? "" : "0";
}

function translatedRect(rect: DOMRect, dy: number) {
  return new DOMRect(rect.left, rect.top + dy, rect.width, rect.height);
}

function previewShift(rect: DOMRect, sections: MenuSection[], bounds: Box) {
  const lifted = scaledRect(rect, scales.lift);
  const bottom = bounds.y + bounds.height;
  const overflow = lifted.bottom + contextMenu.gap + estimateMenuHeight(sections, contextMenu, fontScale()) + contextMenu.edge - bottom;
  return Math.max(0, Math.min(overflow, lifted.top - bounds.y - contextMenu.edge));
}

function fontScale() {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.max(1, size / 16) : 1;
}

function safeAreaInsets(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function readBounds(insets: Insets): Box {
  const vv = window.visualViewport;
  const viewport = vv
    ? { x: vv.offsetLeft, y: vv.offsetTop, width: vv.width, height: vv.height }
    : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  return visibleBounds(viewport, insets);
}

function sameBox(a: Box, b: Box) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function useVisibleBounds() {
  const [insets] = useState(() => (typeof document === "undefined" ? NO_INSETS : safeAreaInsets()));
  const [bounds, setBounds] = useState(() => readBounds(insets));
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBounds((prev) => {
        const next = readBounds(insets);
        return sameBox(prev, next) ? prev : next;
      }));
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [insets]);
  return bounds;
}

function useScrollable(el: HTMLElement | null) {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () => setScrollable(isScrollable(el));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [el]);
  return scrollable;
}

function scaledRect(rect: DOMRect, scale: number) {
  const w = rect.width * scale;
  const h = rect.height * scale;
  return new DOMRect(rect.left - (w - rect.width) / 2, rect.top - (h - rect.height) / 2, w, h);
}

function ContextPreview({
  ref,
  source,
  rect,
  open,
  fromScale,
  shift,
  reduceMotion,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  source: HTMLElement;
  rect: DOMRect;
  open: boolean;
  fromScale: number;
  shift: number;
  reduceMotion: boolean;
}) {
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = "0";
    clone.style.transform = "none";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "";
    card.replaceChildren(clone);
    setSourceVisible(source, false);
    releasePress(source);

    card.style.willChange = "transform";
    const lift = reduceMotion
      ? animate(card, { opacity: [0, 1], y: -shift }, { ...fade, y: { duration: 0 } })
      : animate(card, { scale: [fromScale, scales.lift], y: [0, -shift], opacity: [1, 1] }, contextMenu.lift);
    lift.then(() => (card.style.willChange = ""));
    return () => lift.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [frame] = useState(() => document.body.getBoundingClientRect());

  return createPortal(
    <div data-presentation-layer className="pointer-events-none fixed inset-0 z-(--z-menu-preview)">
      <div
        className={cn(
          "scrim-blur absolute inset-0 transition-opacity duration-(--dur-fade-out) ease-(--curve-out) will-change-[opacity]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <m.div
        ref={ref}
        aria-hidden
        className="absolute overflow-hidden rounded-(--r-card) bg-surface shadow-lift"
        style={{ left: rect.left - frame.left, top: rect.top - frame.top, width: rect.width, height: rect.height, scale: fromScale }}
      />
    </div>,
    document.body,
  );
}
