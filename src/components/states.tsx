"use client";

import { WifiOff } from "lucide-react";
import { m } from "motion/react";
import { ActivityIndicator, Button, Skeleton, type TileColor } from "@/design-system/atoms";
import { presets } from "@/design-system/motion";

export function ContentUnavailable({
  icon,
  title,
  description,
  actions,
  plainIcon,
  tone,
}: {
  icon: React.ReactNode;
  plainIcon?: boolean;
  tone?: TileColor;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <m.div {...presets.contentAppear} className="on-scene flex flex-col items-center px-8 py-(--empty-pad-y) text-center">
      {plainIcon ? (
        <div className="mb-4">{icon}</div>
      ) : (
        <div
          style={
            tone
              ? ({ "--well-ink": `var(--ios-${tone})`, "--well-bg": `color-mix(in oklab, var(--ios-${tone}) 13%, transparent)` } as React.CSSProperties)
              : undefined
          }
          className="glyph-well symbol-bounce mb-5 size-(--glyph-well) [animation-delay:80ms] [&_svg]:size-10 [&_svg]:stroke-[1.8]"
        >
          {icon}
        </div>
      )}
      <h2 className="type-title2 text-label">{title}</h2>
      {description && <p className="mt-1.5 max-w-xs type-subheadline text-label-2">{description}</p>}
      {actions && <div className="mt-5 flex flex-col items-center gap-2">{actions}</div>}
    </m.div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <ContentUnavailable
      icon={<WifiOff />}
      title="加载失败"
      description={message}
      actions={
        onRetry && (
          <Button variant="gray" size="small" onClick={onRetry}>
            重试
          </Button>
        )
      }
    />
  );
}

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return (
    <div className="on-scene flex flex-col items-center gap-2 py-20 text-label-2">
      <ActivityIndicator size={24} />
      <span className="type-footnote">{label}</span>
    </div>
  );
}

export function ListSkeleton({ rows = 3, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="px-(--margin)">
      <div className="overflow-hidden mail-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-(--row-min-h) items-center gap-3 pl-(--row-pad-x)">
            {avatar && <Skeleton className="size-10 rounded-full" />}
            <div className="mr-(--row-pad-x) flex flex-1 flex-col gap-2 border-b-(length:--hairline) border-separator py-3.5 last:border-0">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
