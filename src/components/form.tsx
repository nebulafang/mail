"use client";

import { ChevronsUpDown, CircleX } from "lucide-react";
import { m, useTransform } from "motion/react";
import { useState } from "react";
import { haptic } from "@/design-system/haptics";
import { scales, springs } from "@/design-system/motion";
import { useLensDrag } from "@/hooks/use-lens-drag";
import { useMenuTrigger } from "@/hooks/use-menu-trigger";
import { present } from "@/presentation/api";
import type { MenuPointer } from "@/presentation/store";
import { cn } from "@/lib/utils";



export type SegmentOption<T extends string> = { value: T; label: React.ReactNode; disabled?: boolean };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const { containerRef, pos, lens } = useLensDrag({
    count: options.length,
    activeIndex: index,
    spring: springs.segment,
    lensScale: scales.segmentLens,
    onlyFromActive: true,
    onCommit: (i) => {
      if (!options[i].disabled) onChange(options[i].value);
    },
  });
  const thumbX = useTransform(pos, (p) => `${p * 100}%`);
  const glass = useTransform(lens, [1, scales.segmentLens], [0, 1]);
  const solid = useTransform(glass, (g) => 1 - g);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      data-swipe-owner
      className={cn("relative flex h-(--segment-h) touch-pan-y rounded-full bg-fill-3 p-0.5", className)}
    >
      <m.span
        aria-hidden
        style={{ x: thumbX, scale: lens, width: `calc((100% - var(--spacing) * 1) / ${options.length})` }}
        className="stack absolute inset-y-0.5 left-0.5 rounded-full"
      >
        <m.span style={{ opacity: solid }} className="rounded-full bg-segment-thumb shadow-segment" />
        <m.span style={{ opacity: glass }} className="lg lg-clear rounded-full" />
      </m.span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          onClick={() => {
            if (o.value !== value) haptic("selection");
            onChange(o.value);
          }}
          className={cn(
            "pressable relative z-(--z-raised) flex-1 truncate rounded-full px-1.5 type-footnote text-label [--press-scale:var(--press-scale-segment)]",
            o.value === value ? "font-semibold" : "font-medium",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}


export function TextField({
  label,
  trailing,
  onClear,
  className,
  ref,
  ...input
}: {
  label?: string;
  trailing?: React.ReactNode;
  onClear?: () => void;
  ref?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  const hasValue = input.value !== undefined ? String(input.value).length > 0 : true;
  return (
    <label
      className={cn(
        "flex min-h-(--row-min-h) items-center gap-3 bg-surface px-(--row-pad-x)",
        className,
      )}
    >
      {label && <span className="w-(--field-label-w) shrink-0 type-body text-label">{label}</span>}
      <input
        ref={ref}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        className="h-(--control-h) min-w-0 flex-1 bg-transparent type-body text-label caret-tint outline-none placeholder:text-label-3 aria-invalid:text-ios-red [&::-webkit-search-cancel-button]:hidden"
      />
      {onClear && focused && hasValue && (
        <button
          type="button"
          aria-label="清除"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="press-fade hit-area -mr-1 grid size-8 shrink-0 place-items-center text-label-3"
        >
          <CircleX className="size-(--icon-sm) fill-current text-surface [&>path]:stroke-surface" />
        </button>
      )}
      {trailing && <span className="shrink-0 type-body text-label-2">{trailing}</span>}
    </label>
  );
}


export function Picker<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const current = options.find((o) => o.value === value);
  const open = async (anchor: HTMLElement, pointer?: MenuPointer) => {
    const picked = await present.menu({
      anchor,
      pointer,
      sections: [{ items: options.map((o) => ({ id: o.value, label: o.label, checked: o.value === value })) }],
    });
    if (picked && picked !== value) {
      haptic("selection");
      onChange(picked as T);
    }
  };
  const trigger = useMenuTrigger(open);
  return (
    <button
      type="button"
      aria-label={`${label}：${current?.label ?? ""}`}
      aria-haspopup="menu"
      {...trigger}
      className="press-fade -my-2 flex h-(--control-h) touch-manipulation items-center gap-1 type-body text-label-2"
    >
      {current?.label}
      <ChevronsUpDown className="size-4" strokeWidth={2.2} />
    </button>
  );
}


export function DatePicker({
  value,
  onChange,
  label,
  type = "date",
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  type?: "date" | "time" | "datetime-local";
  min?: string;
  max?: string;
}) {
  return (
    <input
      type={type}
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring -my-1 h-9 rounded-(--r-control-sm) bg-fill-3 px-3 type-body text-label outline-none [&::-webkit-calendar-picker-indicator]:hidden"
    />
  );
}
