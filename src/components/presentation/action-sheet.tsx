"use client";

import { Drawer } from "@base-ui/react/drawer";
import { Fragment, useRef } from "react";
import { exitFallbackMs } from "@/design-system/motion";
import { usePresence } from "./use-presence";
import { usePresentation, type Presentation } from "@/presentation/store";
import { cn } from "@/lib/utils";

type ActionSheetItem = Extract<Presentation, { kind: "actionSheet" }>;

export function ActionSheetView({ item }: { item: ActionSheetItem }) {
  const { dismiss } = usePresentation.getState();
  const { title, message, actions } = item.options;
  const cancel = actions.find((a) => a.role === "cancel") ?? { id: "cancel", label: "取消", role: "cancel" as const };
  const rest = actions.filter((a) => a.role !== "cancel");
  const presence = usePresence(item, exitFallbackMs.actionSheet);
  const popup = useRef<HTMLDivElement>(null);

  const row =
    "row-highlight flex h-(--action-sheet-row-h) w-full items-center justify-center gap-2.5 px-4 type-title3 font-normal outline-none focus-visible:bg-highlight [&_svg]:size-5.5 [&_svg]:shrink-0";

  return (
    <Drawer.Root
      open={presence.open}
      onOpenChange={(open) => !open && dismiss(item.id, null)}
      onOpenChangeComplete={presence.onOpenChangeComplete}
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          className={cn(
            "layer-keep fixed inset-0 z-(--z-action-sheet) min-h-dvh bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))]",
            "transition-opacity duration-(--spring-present-dur) ease-(--spring-present) data-starting-style:opacity-0 data-ending-style:opacity-0 data-swiping:duration-0",
          )}
        />
        <Drawer.Viewport data-presentation-layer className="layer-keep fixed inset-0 z-(--z-action-sheet) flex items-end justify-center">
          <Drawer.Popup
            ref={popup}
            initialFocus={popup}
            className={cn(
              "layer-keep flex w-full max-w-(--action-sheet-max-w) flex-col gap-2 px-(--sheet-float-inset) pb-[max(env(safe-area-inset-bottom),var(--sheet-float-inset))] outline-none",
              "max-h-(--action-sheet-max-h)",
              "motion-spring [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-(--spring-present-dur) ease-(--spring-present)",
              "data-swiping:duration-0 data-starting-style:[transform:translateY(110%)] data-ending-style:[transform:translateY(110%)]",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*var(--swipe-dismiss-base))] data-ending-style:ease-(--curve-ios)",
              "reduced:data-starting-style:opacity-0 reduced:data-ending-style:opacity-0",
            )}
          >
            <Drawer.Content className="lg lg-thick min-h-0 overflow-hidden overflow-y-auto overscroll-contain rounded-(--r-alert)">
              {(title || message) && (
                <div className="border-b-(length:--hairline) border-separator px-5 py-3.5 text-center">
                  {title && <Drawer.Title className="type-footnote font-semibold text-label-2">{title}</Drawer.Title>}
                  {message && <Drawer.Description className="mt-0.5 type-footnote text-label-2">{message}</Drawer.Description>}
                </div>
              )}
              {rest.map((action, index) => (
                <Fragment key={action.id}>
                  {index > 0 && <div className="mx-4 h-(--hairline) bg-separator" />}
                  <button
                    type="button"
                    disabled={action.disabled}
                    onClick={() => dismiss(item.id, action.id)}
                    className={cn(row, action.role === "destructive" ? "text-ios-red" : "text-tint", "disabled:opacity-35")}
                  >
                    {action.icon && <action.icon strokeWidth={2.1} />}
                    {action.label}
                  </button>
                </Fragment>
              ))}
            </Drawer.Content>
            <div className="lg lg-thick shrink-0 overflow-hidden rounded-(--r-alert)">
              <button type="button" onClick={() => dismiss(item.id, cancel.id)} className={cn(row, "font-semibold text-tint")}>
                {cancel.label}
              </button>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
