"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEnvironment } from "@/environment/environment";
import { BRAND_IMAGE } from "./brand";
import { hapticRef, type HapticKind } from "./haptics";

export type TextStyle =
  | "largeTitle"
  | "title1"
  | "title2"
  | "title3"
  | "headline"
  | "body"
  | "callout"
  | "subheadline"
  | "footnote"
  | "caption1"
  | "caption2";

const textStyles: Record<TextStyle, string> = {
  largeTitle: "type-large-title",
  title1: "type-title1",
  title2: "type-title2",
  title3: "type-title3",
  headline: "type-headline",
  body: "type-body",
  callout: "type-callout",
  subheadline: "type-subheadline",
  footnote: "type-footnote",
  caption1: "type-caption1",
  caption2: "type-caption2",
};

export type TextColor = "primary" | "secondary" | "tertiary" | "tint" | "destructive" | "success" | "inherit";
const textColors: Record<TextColor, string> = {
  primary: "text-label",
  secondary: "text-label-2",
  tertiary: "text-label-2",
  tint: "text-tint",
  destructive: "text-ios-red",
  success: "text-ios-green",
  inherit: "",
};

export function Text({
  as: Tag = "span",
  style = "body",
  color = "primary",
  weight,
  align,
  lines,
  mono,
  selectable,
  className,
  children,
  ...rest
}: {
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div" | "label";
  style?: TextStyle;
  color?: TextColor;
  weight?: "regular" | "medium" | "semibold" | "bold";
  align?: "start" | "center" | "end";
  lines?: number;
  mono?: boolean;
  selectable?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "style" | "color">) {
  return (
    <Tag
      className={cn(
        textStyles[style],
        textColors[color],
        weight && { regular: "font-normal", medium: "font-medium", semibold: "font-semibold", bold: "font-bold" }[weight],
        align && { start: "text-start", center: "text-center", end: "text-end" }[align],
        lines === 1 && "truncate",
        lines && lines > 1 && "line-clamp-(--lines)",
        mono && "font-mono tabular-nums",
        selectable && "select-text",
        className,
      )}
      style={lines && lines > 1 ? ({ "--lines": lines } as React.CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}


function SpinnerPetals({ opacity, thin }: { opacity: (i: number) => number; thin?: boolean }) {
  return Array.from({ length: 8 }, (_, i) => (
    <rect
      key={i}
      x="11"
      y="2"
      width={thin ? 2.2 : 2.4}
      height="6"
      rx={thin ? 1.1 : 1.2}
      fill="currentColor"
      opacity={opacity(i)}
      transform={`rotate(${i * 45} 12 12)`}
    />
  ));
}

const spinnerGradient = (i: number) => 0.25 + (0.75 * i) / 7;

export function ActivityIndicator({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      role="progressbar"
      aria-label="加载中"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("spinner-spin shrink-0 text-label-2", className)}
    >
      <SpinnerPetals opacity={spinnerGradient} />
    </svg>
  );
}

export function RefreshSpinner({ petals, spinning, className }: { petals: number; spinning: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(spinning && "spinner-spin", className)}>
      <SpinnerPetals thin opacity={(i) => (spinning ? spinnerGradient(i) : i < petals ? 0.85 : 0)} />
    </svg>
  );
}

export type ButtonVariant = "glass" | "prominent" | "destructive" | "gray" | "plain";
type ButtonSize = "small" | "regular" | "large";

const buttonVariants: Record<ButtonVariant, string> = {
  glass: "lg text-label",
  prominent: "lg lg-tinted",
  destructive: "lg lg-destructive",
  gray: "bg-fill-3 text-tint",
  plain: "text-tint",
};
const buttonSizes: Record<ButtonSize, string> = {
  small: "h-(--control-h-sm) px-3.5 type-subheadline font-semibold gap-1.5 [&_svg]:size-4",
  regular: "h-(--control-h) px-5 type-body font-semibold gap-2 [&_svg]:size-5",
  large: "h-(--control-h-lg) px-6 type-body font-semibold gap-2 [&_svg]:size-5",
};

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  haptic?: boolean | HapticKind;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const hapticProp = (haptic: boolean | HapticKind | undefined) =>
  haptic ? hapticRef(haptic === true ? "light" : haptic) : undefined;

export function Button({
  variant = "glass",
  size = "regular",
  fullWidth,
  loading,
  haptic,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={hapticProp(haptic)}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "pressable relative inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-tint/60",
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        loading && "opacity-100!",
        className,
      )}
      {...rest}
    >
      {loading ? <ActivityIndicator size={18} className="text-current" /> : children}
    </button>
  );
}

export function IconButton({
  label,
  variant = "glass",
  size = 44,
  haptic,
  className,
  children,
  type = "button",
  ...rest
}: {
  label: string;
  variant?: ButtonVariant;
  size?: 32 | 36 | 44 | 50;
  haptic?: boolean | HapticKind;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "pressable relative grid shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-tint/60 [--press-scale:var(--press-scale-tab)]";

  if (size === 32 || size === 36) {
    const visual = size === 32 ? "size-(--icon-button-sm) [&_svg]:size-4" : "size-(--icon-button-md) [&_svg]:size-(--icon-sm)";
    const margin =
      size === 32 ? "-m-[calc((var(--hit)-var(--icon-button-sm))/2)]" : "-m-[calc((var(--hit)-var(--icon-button-md))/2)]";
    return (
      <button
        ref={hapticProp(haptic)}
        type={type}
        aria-label={label}
        title={label}
        className={cn(base, "size-(--hit)", margin, className)}
        {...rest}
      >
        <span className={cn("grid place-items-center rounded-full", buttonVariants[variant], visual)}>{children}</span>
      </button>
    );
  }

  return (
    <button
      ref={hapticProp(haptic)}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        base,
        buttonVariants[variant],
        size === 44 ? "size-(--icon-button) [&_svg]:size-(--icon-md)" : "size-(--icon-button-lg) [&_svg]:size-6",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("skeleton-shimmer block rounded-md", className)}
    />
  );
}

export function Badge({ count, color = "red" }: { count: number; color?: "red" | "tint" | "gray" }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "grid h-6 min-w-6 place-items-center rounded-full px-1.5 type-subheadline font-medium text-on-color tabular-nums",
        { red: "bg-ios-red", tint: "bg-tint", gray: "bg-ios-gray" }[color],
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export type TileColor = "red" | "orange" | "yellow" | "green" | "mint" | "teal" | "cyan" | "blue" | "indigo" | "purple" | "pink" | "gray";

export function IconTile({ color, size = "regular", children }: { color: TileColor; size?: "regular" | "large"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden text-on-color",
        "after:absolute after:inset-0 after:bg-gradient-to-b after:from-white/18 after:to-transparent",
        size === "regular"
          ? "size-(--icon-tile) rounded-(--r-tile) [&_svg]:size-(--icon-sm) [&_svg]:stroke-[2.2]"
          : "size-(--icon-tile-lg) rounded-[calc(var(--icon-tile-lg)*var(--icon-radius-ratio))] [&_svg]:size-6",
      )}
      style={{ background: `var(--ios-${color})` }}
    >
      {children}
    </span>
  );
}

export function TagBadge({
  color,
  size = "regular",
  children,
}: {
  color: string;
  size?: "regular" | "large";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 truncate rounded-full font-semibold",
        size === "regular" ? "h-5 px-2 type-caption2" : "h-6 px-2.5 type-caption1",
      )}
      style={{
        color: `var(--ios-${color})`,
        background: `color-mix(in oklab, var(--ios-${color}) 16%, transparent)`,
        boxShadow: `inset 0 0 0 0.5px color-mix(in oklab, var(--ios-${color}) 35%, transparent)`,
      }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: `var(--ios-${color})` }} />
      {children}
    </span>
  );
}

const AVATAR_COLORS: TileColor[] = ["orange", "blue", "green", "purple", "pink", "cyan", "indigo", "teal"];

function seedColor(seed: string, offset = 0): TileColor {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[(Math.abs(hash) + offset) % AVATAR_COLORS.length];
}

export function Avatar({ seed, text, size = 40, src }: { seed: string; text: string; size?: 32 | 40 | 44 | 56 | 88; src?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sizeClass = {
    32: "size-8 type-footnote",
    40: "size-10 type-headline",
    44: "size-11 type-headline",
    56: "size-14 type-title2",
    88: "size-22 type-large-title",
  }[size];

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        draggable={false}
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={cn("shrink-0 rounded-full bg-fill-3 object-cover select-none", sizeClass)}
      />
    );
  }

  const color = seedColor(seed);
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-on-color uppercase",
        "after:absolute after:inset-0 after:bg-gradient-to-b after:from-white/20 after:to-transparent",
        sizeClass,
      )}
      style={{ background: `var(--ios-${color})` }}
    >
      {text.slice(0, 1)}
    </span>
  );
}

export function AppIcon({ size = 64 }: { size?: 56 | 64 | 80 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND_IMAGE}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 rounded-[22.5%] shadow-(--app-icon-shadow) select-none"
    />
  );
}

export function Inset({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-(--margin)", className)}>{children}</div>;
}

export function LiveDot({ className }: { className?: string }) {
  const { reduceMotion } = useEnvironment();
  return (
    <span aria-hidden className={cn("stack size-2 shrink-0", className)}>
      {!reduceMotion && <span className="live-pulse rounded-full bg-ios-green" />}
      <span className="rounded-full bg-ios-green" />
    </span>
  );
}
