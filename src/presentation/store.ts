"use client";

import type { ComponentType, ReactNode } from "react";
import { create } from "zustand";

export type Detent = "fit" | "medium" | "large" | number;

export type SheetOptions = {
  content: ReactNode;
  detents?: Detent[];
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
};

type ActionRole = "default" | "cancel" | "destructive";
type DialogIcon = ComponentType<{ className?: string; strokeWidth?: number }>;
export type DialogAction = { id: string; label: string; role?: ActionRole; disabled?: boolean; icon?: DialogIcon };

export type AlertOptions = {
  title: string;
  icon?: DialogIcon;
  tone?: "red" | "orange" | "yellow" | "green" | "blue" | "indigo" | "purple" | "gray";
  message?: ReactNode;
  actions?: DialogAction[];
};

export type ActionSheetOptions = {
  title?: string;
  message?: string;
  actions: DialogAction[];
};

type MenuItem = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  role?: "destructive";
  disabled?: boolean;
  checked?: boolean;
};
export type MenuSection = { title?: string; items: MenuItem[] };

export type MenuOptions = {
  anchor: Element | DOMRect;
  sections: MenuSection[];
  preview?: HTMLElement;
  previewFromScale?: number;
  pointer?: MenuPointer;
};

export type MenuPointer = { id: number; x: number; y: number; released?: boolean };

type Base = { id: string; open: boolean; resolve: (value: string | null) => void };
export type Presentation =
  | (Base & { kind: "sheet"; options: SheetOptions })
  | (Base & { kind: "alert"; options: AlertOptions })
  | (Base & { kind: "actionSheet"; options: ActionSheetOptions })
  | (Base & { kind: "menu"; options: MenuOptions });

export type ToastStatus = "default" | "success" | "error" | "warning" | "info" | "loading";
export type ToastItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  status: ToastStatus;
  duration: number;
  action?: { label: string; onClick: () => void };
  version: number;
};

type PresentationStore = {
  items: Presentation[];
  toasts: ToastItem[];
  add: (item: Presentation) => void;
  dismiss: (id: string, result?: string | null) => void;
  remove: (id: string) => void;
  upsertToast: (toast: Omit<ToastItem, "version">) => void;
  removeToast: (id?: string) => void;
};

export const usePresentation = create<PresentationStore>()((set, get) => ({
  items: [],
  toasts: [],
  add: (item) =>
    set((s) => ({
      items: [
        ...s.items.map((i) => {
          if (item.kind === "menu" && i.kind === "menu" && i.open) {
            i.resolve(null);
            return { ...i, open: false };
          }
          return i;
        }),
        item,
      ],
    })),
  dismiss: (id, result = null) => {
    const item = get().items.find((i) => i.id === id);
    if (!item || !item.open) return;
    item.resolve(result);
    if (item.kind === "sheet") item.options.onDismiss?.();
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, open: false } : i)) }));
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  upsertToast: (toast) =>
    set((s) => {
      const existing = s.toasts.find((t) => t.id === toast.id);
      if (existing) {
        const updated = { ...toast, version: existing.version + 1 };
        return { toasts: [updated, ...s.toasts.filter((t) => t.id !== toast.id)] };
      }
      return { toasts: [{ ...toast, version: 0 }, ...s.toasts].slice(0, 5) };
    }),
  removeToast: (id) => set((s) => ({ toasts: id ? s.toasts.filter((t) => t.id !== id) : [] })),
}));
