"use client";

import { haptic } from "@/design-system/haptics";
import { toast } from "@/presentation/api";

const UNDO_MS = 4000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function withoutPendingDeletes<T extends { id: string }>(items: T[]) {
  return pending.size ? items.filter((item) => !pending.has(item.id)) : items;
}

export function scheduleUndoableDelete({
  id,
  title,
  commit,
  undo,
}: {
  id: string;
  title: string;
  commit: () => Promise<void>;
  undo: () => void;
}) {
  clearTimeout(pending.get(id));
  pending.set(
    id,
    setTimeout(() => {
      pending.delete(id);
      void commit();
    }, UNDO_MS),
  );
  toast.success(title, {
    duration: UNDO_MS,
    action: {
      label: "撤销",
      onClick: () => {
        const timer = pending.get(id);
        if (!timer) return;
        clearTimeout(timer);
        pending.delete(id);
        undo();
        haptic("light");
      },
    },
  });
}
