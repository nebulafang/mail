"use client";

import { Inbox, Settings } from "lucide-react";

const STRIPES = [70, 90, 55];

export function GlassPreview() {
  return (
    <div
      aria-hidden
      className="stack h-36 overflow-hidden rounded-(--r-card)"
      style={{
        background:
          "radial-gradient(circle at 18% 30%, var(--ios-orange) 0 18%, transparent 19%), radial-gradient(circle at 70% 25%, var(--ios-pink) 0 22%, transparent 23%), radial-gradient(circle at 45% 80%, var(--ios-blue) 0 26%, transparent 27%), linear-gradient(135deg, var(--ios-cyan), var(--ios-indigo))",
      }}
    >
      <div className="m-4 flex flex-col gap-2 self-start opacity-80">
        {STRIPES.map((w) => (
          <span key={w} className="h-2 rounded-full bg-on-color/80" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="lg mx-5 mb-4 flex h-14 items-center justify-around self-end rounded-full">
        <span className="flex flex-col items-center gap-0.5 text-tint">
          <Inbox className="size-5" strokeWidth={2.2} />
          <span className="type-caption2 font-semibold">邮箱</span>
        </span>
        <span className="flex flex-col items-center gap-0.5 text-label">
          <Settings className="size-5" />
          <span className="type-caption2 font-semibold">设置</span>
        </span>
      </div>
    </div>
  );
}
