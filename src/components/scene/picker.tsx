"use client";

import { useRef } from "react";
import { haptic } from "@/design-system/haptics";
import { scenes, type SceneId } from "@/design-system/scenes";
import { cn } from "@/lib/utils";
import { SceneBackdrop } from ".";

export function ScenePicker({ value, onChange }: { value: SceneId; onChange: (scene: SceneId) => void }) {
  const group = useRef<HTMLDivElement>(null);

  function pick(scene: SceneId) {
    if (scene === value) return;
    haptic("selection");
    onChange(scene);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const index = (scenes.findIndex((s) => s.id === value) + step + scenes.length) % scenes.length;
    pick(scenes[index].id);
    group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[index]?.focus();
  }

  return (
    <div ref={group} role="radiogroup" aria-label="背景" onKeyDown={onKeyDown} className="grid grid-cols-4 gap-2.5">
      {scenes.map((s) => {
        const selected = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => pick(s.id)}
            className="pressable flex flex-col items-center gap-1.5 rounded-(--r-field) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
          >
            <span
              className={cn(
                "relative block aspect-[3/4] w-full overflow-hidden rounded-(--r-field) bg-canvas ring-1 ring-separator transition-shadow duration-(--dur-fade)",
                selected && "ring-2 ring-tint",
              )}
            >
              <SceneBackdrop scene={s.id} still />
              <span className="absolute top-[16%] left-[12%] h-[4%] w-[36%] rounded-full bg-label/70" />
              <span className="absolute inset-x-[12%] top-[30%] h-[18%] rounded-[5px] bg-surface" />
            </span>
            <span className={cn("type-caption1", selected ? "font-semibold text-tint" : "text-label-2")}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
