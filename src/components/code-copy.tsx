"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import { Button } from "@/design-system/atoms";
import { hapticRef } from "@/design-system/haptics";
import { COPIED_MS, presets } from "@/design-system/motion";
import { toast } from "@/presentation/api";
import { cn, copyText } from "@/lib/utils";

function useCopyCode(code: string) {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copyCode: async () => {
      if (!(await copyText(code))) return toast.error("复制失败");
      setCopied(true);
      toast.success(`验证码 ${code} 已复制`);
      setTimeout(() => setCopied(false), COPIED_MS);
    },
  };
}

function CopyIcon({ copied, className }: { copied: boolean; className?: string }) {
  return (
    <span className="stack place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <m.span key={copied ? "check" : "copy"} {...presets.iconSwap} className="grid place-items-center">
          {copied ? <Check className={className} /> : <Copy className={className} />}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

export function CodeChip({ code, className }: { code: string; className?: string }) {
  const { copied, copyCode } = useCopyCode(code);
  return (
    <button
      ref={hapticRef("success")}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copyCode();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "pressable hit-area inline-flex h-(--chip-h) shrink-0 items-center gap-1 rounded-full bg-tint-fill px-2.5 font-mono type-subheadline font-semibold tracking-wider text-tint",
        className,
      )}
      aria-label={`复制验证码 ${code}`}
    >
      <CopyIcon copied={copied} className="size-3.5" />
      {code}
    </button>
  );
}

export function CodeCard({ code, caption }: { code: string; caption?: React.ReactNode }) {
  const { copied, copyCode } = useCopyCode(code);
  return (
    <div className="flex items-center gap-3 mail-card p-(--card-pad-sm)">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tint-fill text-tint">
        <KeyRound className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="type-footnote text-label-2">验证码</div>
        <div className="font-mono type-title1 tracking-(--code-tracking) select-all">{code}</div>
        {caption && <div className="truncate type-caption1 text-label-2">{caption}</div>}
      </div>
      <Button variant="prominent" size="small" haptic="success" onClick={copyCode}>
        <CopyIcon copied={copied} />
        {copied ? "已复制" : "复制"}
      </Button>
    </div>
  );
}
