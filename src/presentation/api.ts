"use client";

import type { ReactNode } from "react";
import {
  usePresentation,
  type ActionSheetOptions,
  type AlertOptions,
  type MenuOptions,
  type Presentation,
  type SheetOptions,
  type ToastItem,
  type ToastStatus,
} from "./store";
import { watchPointerRelease } from "./menu-layout";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function open<K extends Presentation["kind"]>(kind: K, options: Extract<Presentation, { kind: K }>["options"]) {
  const id = nextId(kind);
  const promise = new Promise<string | null>((resolve) => {
    usePresentation.getState().add({ id, kind, options, open: true, resolve } as Presentation);
  });
  return { id, promise };
}

export const present = {
  sheet(options: SheetOptions) {
    const { id, promise } = open("sheet", options);
    return { id, closed: promise, dismiss: () => usePresentation.getState().dismiss(id) };
  },
  alert(options: AlertOptions) {
    return open("alert", options).promise;
  },
  async confirm(options: { title: string; message?: ReactNode; confirmLabel?: string; destructive?: boolean }) {
    const result = await present.alert({
      title: options.title,
      message: options.message,
      actions: [
        { id: "cancel", label: "取消", role: "cancel" },
        { id: "confirm", label: options.confirmLabel ?? "好", role: options.destructive ? "destructive" : "default" },
      ],
    });
    return result === "confirm";
  },
  actionSheet(options: ActionSheetOptions) {
    return open("actionSheet", options).promise;
  },
  menu(options: MenuOptions) {
    if (options.pointer && typeof window !== "undefined") watchPointerRelease(options.pointer, window);
    return open("menu", options).promise;
  },
  dismiss(id: string) {
    usePresentation.getState().dismiss(id);
  },
};

type ToastOptions = {
  id?: string;
  description?: ReactNode;
  duration?: number;
  action?: ToastItem["action"];
};

const DEFAULT_DURATION = 3200;

function show(status: ToastStatus, title: ReactNode, options: ToastOptions = {}) {
  const duplicate =
    !options.id && typeof title === "string"
      ? usePresentation.getState().toasts.find((t) => t.title === title && t.status === status && status !== "loading")
      : undefined;
  const id = options.id ?? duplicate?.id ?? nextId("toast");
  usePresentation.getState().upsertToast({
    id,
    title,
    status,
    description: options.description,
    action: options.action,
    duration: options.duration ?? (status === "loading" ? Infinity : status === "error" ? 4500 : DEFAULT_DURATION),
  });
  return id;
}

export const toast = Object.assign((title: ReactNode, options?: ToastOptions) => show("default", title, options), {
  success: (title: ReactNode, options?: ToastOptions) => show("success", title, options),
  error: (title: ReactNode, options?: ToastOptions) => show("error", title, options),
  warning: (title: ReactNode, options?: ToastOptions) => show("warning", title, options),
  info: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
  loading: (title: ReactNode, options?: ToastOptions) => show("loading", title, options),
  dismiss: (id?: string) => usePresentation.getState().removeToast(id),
  async promise<T>(
    promise: Promise<T>,
    messages: { loading: ReactNode; success: ReactNode | ((value: T) => ReactNode); error: ReactNode | ((e: Error) => ReactNode) },
  ) {
    const id = show("loading", messages.loading);
    try {
      const value = await promise;
      show("success", typeof messages.success === "function" ? messages.success(value) : messages.success, { id });
      return value;
    } catch (e) {
      show("error", typeof messages.error === "function" ? messages.error(e as Error) : messages.error, { id });
      throw e;
    }
  },
});

export const toastError = (e: Error) => toast.error(e.message);
