"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef } from "react";
import { exitFallbackMs } from "@/design-system/motion";
import { usePresence } from "./use-presence";
import { usePresentation, type DialogAction, type Presentation } from "@/presentation/store";
import { cn } from "@/lib/utils";

type AlertItem = Extract<Presentation, { kind: "alert" }>;

const DEFAULT_ACTIONS: DialogAction[] = [{ id: "ok", label: "好" }];

export function AlertView({ item }: { item: AlertItem }) {
  const { dismiss } = usePresentation.getState();
  const actions = item.options.actions ?? DEFAULT_ACTIONS;
  const cancel = actions.find((a) => a.role === "cancel");
  const presence = usePresence(item, exitFallbackMs.alert);
  const popup = useRef<HTMLDivElement>(null);
  const Icon = item.options.icon;
  const tone = item.options.tone ?? "blue";
  const horizontal = actions.length === 2;
  const ordered = cancel
    ? horizontal
      ? [cancel, ...actions.filter((a) => a !== cancel)]
      : [...actions.filter((a) => a !== cancel), cancel]
    : actions;

  return (
    <AlertDialog.Root
      open={presence.open}
      onOpenChange={(open) => !open && dismiss(item.id, cancel?.id ?? null)}
      onOpenChangeComplete={presence.onOpenChangeComplete}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="layer-keep fixed inset-0 z-(--z-alert) bg-scrim transition-opacity duration-(--dur-fade-out) ease-(--curve-out) data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <AlertDialog.Viewport data-presentation-layer className="layer-keep fixed inset-0 z-(--z-alert) grid place-items-center p-6">
          <AlertDialog.Popup
            ref={popup}
            initialFocus={popup}
            className={cn(
              "layer-keep lg lg-thick w-(--alert-w) rounded-(--r-alert) p-(--alert-pad) pt-5 outline-none",
              "motion-spring transition-[transform,opacity] duration-(--spring-alert-dur) ease-(--spring-alert)",
              "data-starting-style:scale-110 data-starting-style:opacity-0",
              "data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-(--spring-dismiss-dur) data-ending-style:ease-(--spring-dismiss)",
            )}
          >
            {Icon && (
              <span
                aria-hidden
                style={{ "--well-ink": `var(--ios-${tone})`, "--well-bg": `color-mix(in oklab, var(--ios-${tone}) 14%, transparent)` } as React.CSSProperties}
                className="glyph-well symbol-bounce mb-3 ml-1 size-(--glyph-well-sm) [animation-delay:120ms]"
              >
                <Icon className="size-5.5" strokeWidth={2.2} />
              </span>
            )}
            <AlertDialog.Title className="px-1 type-headline text-label">{item.options.title}</AlertDialog.Title>
            {item.options.message && (
              <AlertDialog.Description className="mt-1 px-1 type-subheadline text-label-2">
                {item.options.message}
              </AlertDialog.Description>
            )}
            <div className={cn("mt-5 gap-2.5", horizontal ? "grid grid-cols-2" : "flex flex-col")}>
              {ordered.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => dismiss(item.id, action.id)}
                  className={cn(
                    "pressable h-(--alert-button-h) truncate rounded-full px-3 type-body font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tint/60",
                    action.role === "cancel" && "bg-fill-2 text-label",
                    action.role === "destructive" && "bg-fill-2 text-ios-red",
                    (!action.role || action.role === "default") && "bg-tint text-on-tint",
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
