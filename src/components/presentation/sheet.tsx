"use client";

import { Drawer } from "@base-ui/react/drawer";
import { Check, X } from "lucide-react";
import { createContext, use, useRef, useState } from "react";
import { ActivityIndicator, IconButton } from "@/design-system/atoms";
import { exitFallbackMs, sheetDetents } from "@/design-system/motion";
import { usePresence } from "./use-presence";
import { usePresentation, type Detent, type Presentation } from "@/presentation/store";
import { cn } from "@/lib/utils";

type SheetItem = Extract<Presentation, { kind: "sheet" }>;

const SheetContext = createContext<{ dismiss: (result?: string) => void } | null>(null);

export function useSheet() {
  const ctx = use(SheetContext);
  if (!ctx) throw new Error("需要在 present.sheet() 的内容里使用");
  return ctx;
}

const toSnapPoint = (d: Exclude<Detent, "fit">) =>
  d === "large" ? sheetDetents.large : d === "medium" ? sheetDetents.medium : d;

export function SheetView({ item }: { item: SheetItem }) {
  const { dismiss } = usePresentation.getState();
  const { detents = ["large"], dismissible = true, title, content } = item.options;
  const fit = detents.length === 1 && detents[0] === "fit";
  const snapPoints = detents.filter((d): d is Exclude<Detent, "fit"> => d !== "fit").map(toSnapPoint);
  const single = snapPoints.length <= 1;
  const [snapPoint, setSnapPoint] = useState<number | string | null>(snapPoints[0] ?? null);
  const presence = usePresence(item, exitFallbackMs.sheet);
  const popup = useRef<HTMLDivElement>(null);

  return (
    <Drawer.Root
      open={presence.open}
      onOpenChange={(open) => !open && dismissible && dismiss(item.id)}
      onOpenChangeComplete={presence.onOpenChangeComplete}
      snapPoints={snapPoints.length > 1 ? snapPoints : undefined}
      snapPoint={snapPoints.length > 1 ? snapPoint : undefined}
      onSnapPointChange={setSnapPoint}
      disablePointerDismissal={!dismissible}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          data-snap={snapPoints.length > 1 ? "" : undefined}
          className={cn(
            "layer-keep fixed inset-0 z-(--z-sheet) min-h-dvh bg-scrim opacity-[max(var(--min-dim,0),calc(1-var(--drawer-swipe-progress)))] data-[snap]:[--min-dim:0.6]",
            "transition-opacity duration-(--spring-present-dur) ease-(--spring-present) data-starting-style:opacity-0 data-ending-style:opacity-0 data-swiping:duration-0",
            "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*var(--swipe-dismiss-base))] data-ending-style:ease-(--curve-ios)",
          )}
        />
        <Drawer.Viewport data-presentation-layer className="layer-keep fixed inset-0 z-(--z-sheet) flex items-end justify-center">
          <Drawer.Popup
            ref={popup}
            initialFocus={popup}
            className={cn(
              "layer-keep group/sheet relative flex flex-col outline-none",
              fit ? "max-h-(--sheet-detent-large)" : "h-(--sheet-detent-large)",
              "rounded-t-(--r-sheet) text-label",
              "[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)))]",
              "motion-spring transition-transform duration-(--spring-present-dur) ease-(--spring-present)",
              "data-swiping:duration-0 data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)]",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*var(--swipe-dismiss-base))] data-ending-style:ease-(--curve-ios)",
              "reduced:transition-opacity reduced:data-starting-style:opacity-0 reduced:data-ending-style:opacity-0",
              "lg lg-thick w-[min(calc(100%-2*var(--sheet-float-inset)),var(--content-max-w))]",
              "data-expanded:w-[min(100%,var(--content-max-w))] data-expanded:[--glass-fill:var(--bg-elevated)]",
              single && "lg-over-scrim w-[min(100%,var(--content-max-w))]",
            )}
            style={single ? ({ "--glass-fill": "var(--bg-elevated)" } as React.CSSProperties) : undefined}
          >
            <SheetContext value={{ dismiss: (result) => dismiss(item.id, result ?? null) }}>
              {snapPoints.length > 1 && (
                <div
                  aria-hidden
                  className="mx-auto mt-(--grabber-top) h-(--grabber-h) w-(--grabber-w) shrink-0 rounded-full bg-label-3"
                />
              )}
              {title && <Drawer.Title className="sr-only">{title}</Drawer.Title>}
              <Drawer.Content className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-(--sheet-pad-bottom)">
                {content}
              </Drawer.Content>
            </SheetContext>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function SheetHeader({
  title,
  onConfirm,
  confirmLabel = "完成",
  confirmDisabled,
  confirmLoading,
  cancel = true,
}: {
  title: string;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  cancel?: boolean;
}) {
  const { dismiss } = useSheet();
  return (
    <div className="sticky top-0 z-(--z-raised) grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-3 pb-2">
      <div className="flex justify-start">
        {cancel && (
          <IconButton label="关闭" onClick={() => dismiss()}>
            <X strokeWidth={2.4} />
          </IconButton>
        )}
      </div>
      <Drawer.Title render={<h2 />} className="type-headline">
        {title}
      </Drawer.Title>
      <div className="flex justify-end">
        {onConfirm && (
          <IconButton
            label={confirmLabel}
            variant="prominent"
            haptic="success"
            disabled={confirmDisabled || confirmLoading}
            onClick={onConfirm}
          >
            {confirmLoading ? <ActivityIndicator size={18} className="text-current" /> : <Check strokeWidth={2.6} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
