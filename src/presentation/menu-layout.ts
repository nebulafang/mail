import type { MenuPointer, MenuSection } from "./store";

export type Box = { x: number; y: number; width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export type MenuMetrics = { itemHeight: number; sectionGap: number; panelPadding: number };
export type MenuPlacement = "beside" | "overlap";

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function visibleBounds(viewport: Box, insets: Insets = NO_INSETS): Box {
  return {
    x: viewport.x + insets.left,
    y: viewport.y + insets.top,
    width: Math.max(0, viewport.width - insets.left - insets.right),
    height: Math.max(0, viewport.height - insets.top - insets.bottom),
  };
}

export function estimateMenuHeight(sections: MenuSection[], metrics: MenuMetrics, scale = 1) {
  const items = sections.reduce((n, s) => n + s.items.length, 0);
  const titles = sections.filter((s) => s.title).length;
  const rows = items * metrics.itemHeight + titles * metrics.itemHeight * 0.6;
  return rows * scale + Math.max(0, sections.length - 1) * metrics.sectionGap + metrics.panelPadding;
}

export function spaceBeside(anchor: { top: number; bottom: number }, bounds: Box, gap: number, padding: number) {
  return {
    above: anchor.top - gap - (bounds.y + padding),
    below: bounds.y + bounds.height - padding - (anchor.bottom + gap),
  };
}

export function menuPlacement(anchor: { top: number; bottom: number }, bounds: Box, menuHeight: number, gap: number, padding: number): MenuPlacement {
  const { above, below } = spaceBeside(anchor, bounds, gap, padding);
  return Math.max(above, below) >= menuHeight ? "beside" : "overlap";
}

export function isScrollable(el: { scrollHeight: number; clientHeight: number }) {
  return el.scrollHeight - el.clientHeight > 1;
}

type ReleaseEvent = Event & { pointerId?: number; pointerType?: string; touches?: { length: number } };

export function watchPointerRelease(pointer: MenuPointer, target: EventTarget, capture = true) {
  const options = { capture };
  const stop = () => {
    target.removeEventListener("pointerup", onPointer, options);
    target.removeEventListener("pointercancel", onPointer, options);
    target.removeEventListener("touchend", onTouch, options);
    target.removeEventListener("touchcancel", onTouch, options);
  };
  const release = () => {
    pointer.released = true;
    stop();
  };
  function onPointer(e: Event) {
    const event = e as ReleaseEvent;
    if (event.pointerId !== pointer.id) return;
    if (event.type === "pointercancel" && event.pointerType === "touch") return;
    release();
  }
  function onTouch(e: Event) {
    if (!(e as ReleaseEvent).touches?.length) release();
  }
  target.addEventListener("pointerup", onPointer, options);
  target.addEventListener("pointercancel", onPointer, options);
  target.addEventListener("touchend", onTouch, options);
  target.addEventListener("touchcancel", onTouch, options);
  return stop;
}

export type TriggerPress = "immediate" | "hold";

export function triggerPress(pointerType: string): TriggerPress {
  return pointerType === "mouse" ? "immediate" : "hold";
}

export function createItemClickGate() {
  let pressedInside = false;
  return {
    press() {
      pressedInside = true;
    },
    allows(detail: number) {
      return detail === 0 || pressedInside;
    },
  };
}
