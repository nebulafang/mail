"use client";

import { CircleX, Search, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/design-system/atoms";
import { springs } from "@/design-system/motion";
import { cn } from "@/lib/utils";

const cancelMotion = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16, transition: springs.dismiss },
  transition: springs.snappy,
};

export function SearchField({
  value,
  onChange,
  placeholder = "搜索",
  variant = "inline",
  onSubmit,
  onFocusChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "glass" | "inline";
  onSubmit?: () => void;
  onFocusChange?: (focused: boolean) => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const active = focused || value.length > 0;
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <div className="flex w-full items-center gap-2">
      <label
        className={cn(
          "focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-full px-3.5 text-label-2",
          variant === "glass" ? "lg h-(--search-h-glass)" : "h-(--search-h) bg-fill-3",
        )}
      >
        <Search className="size-(--icon-sm) shrink-0" strokeWidth={2.3} />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onSubmit?.();
              input.current?.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent type-body text-label caret-tint outline-none placeholder:text-label-2 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="清除"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="press-fade hit-area -mr-1.5 grid size-8 shrink-0 place-items-center"
          >
            <CircleX className="size-(--icon-sm) fill-label-3 text-surface" />
          </button>
        )}
      </label>
      <AnimatePresence initial={false}>
        {active && (
          <m.div key="cancel" {...cancelMotion} className="shrink-0">
            <IconButton
              label="取消搜索"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                input.current?.blur();
              }}
            >
              <X strokeWidth={2.4} />
            </IconButton>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
