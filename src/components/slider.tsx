"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";


export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  minIcon,
  maxIcon,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  minIcon?: React.ReactNode;
  maxIcon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-label-2 [&_svg]:size-5">
      {minIcon}
      <BaseSlider.Root
        value={value}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        min={min}
        max={max}
        step={step}
        className="flex-1"
      >
        <BaseSlider.Control className="flex h-(--control-h) w-full touch-none items-center select-none">
          <BaseSlider.Track className="relative h-1.5 w-full rounded-full bg-fill">
            <BaseSlider.Indicator className="rounded-full bg-tint" />
            <BaseSlider.Thumb
              aria-label={label}
              className={cn(
                "group/thumb stack h-(--slider-thumb-h) w-(--slider-thumb-w) rounded-full outline-none",
                "motion-spring transition-[scale] duration-(--spring-snappy-dur) ease-(--spring-snappy)",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tint/60",
                "data-dragging:scale-(--slider-thumb-drag-scale)",
              )}
            >
              <span
                aria-hidden
                className="rounded-full bg-thumb shadow-slider transition-opacity duration-(--dur-fade) ease-(--curve-out) group-data-dragging/thumb:opacity-0"
              />
              <span
                aria-hidden
                className="lg lg-clear rounded-full opacity-0 transition-opacity duration-(--dur-fade) ease-(--curve-out) group-data-dragging/thumb:opacity-100"
              />
            </BaseSlider.Thumb>
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
      {maxIcon}
    </div>
  );
}
