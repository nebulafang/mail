"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { presets } from "@/design-system/motion";
import { toast } from "@/presentation/api";

const RETRY_MS = 5_000;

async function probe() {
  try {
    await fetch("/api/ping", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(RETRY_MS) });
    return true;
  } catch {
    return false;
  }
}

export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const queryClient = useQueryClient();
  const wasOffline = useRef(false);

  useEffect(() => {
    onlineManager.setEventListener(() => () => {});

    let alive = true;
    const check = async () => {
      const ok = await probe();
      if (alive) setOnline(ok);
    };
    const onOffline = () => void check();
    const onOnline = () => void check();

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) void check();
    return () => {
      alive = false;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    onlineManager.setOnline(online);
    if (!online) {
      wasOffline.current = true;
      const timer = setInterval(() => void probe().then((ok) => ok && setOnline(true)), RETRY_MS);
      return () => clearInterval(timer);
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    toast.success("已恢复连接");
    queryClient.invalidateQueries();
  }, [online, queryClient]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+var(--nav-bar-h)+var(--space-2))] z-(--z-floating) flex justify-center px-(--margin)">
      <AnimatePresence>
        {!online && (
          <m.div
            role="status"
            {...presets.pillIn}
            className="lg flex items-center gap-2 rounded-full px-4 py-2.5 type-footnote font-semibold text-label"
          >
            <WifiOff className="size-4 shrink-0 text-ios-red" strokeWidth={2.4} />
            网络已断开，恢复后自动同步
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
