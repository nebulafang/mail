"use client";

import { MotionConfig } from "motion/react";
import { createContext, use, useEffect, useSyncExternalStore } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useScene } from "@/components/scene/context";
import { systemColors } from "@/design-system/colors";
import { scenes } from "@/design-system/scenes";
import { useSettings, type Tristate } from "@/store/settings";
import { watchKeyboard } from "./keyboard";
import { autoLowEnd } from "./perf-script";
import { setThemeColors } from "./theme";

export type Environment = {
  glassClarity: number;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  highContrast: boolean;
  textScale: number;
  lowEnd: boolean;
};

const defaults: Environment = {
  glassClarity: 0.5,
  reduceMotion: false,
  reduceTransparency: false,
  highContrast: false,
  textScale: 1,
  lowEnd: false,
};

const EnvironmentContext = createContext<Environment>(defaults);

export const useEnvironment = () => use(EnvironmentContext);

const resolve = (value: Tristate, system: boolean) => (value === "system" ? system : value === "on");
const useMq = (query: string) => useMediaQuery(query, { initializeWithValue: false });

let weakDevice: boolean | null = null;
const detectWeakDevice = () => (weakDevice ??= autoLowEnd());
const serverWeakDevice = () => false;
const noopSubscribe = () => () => {};

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const systemReduceMotion = useMq("(prefers-reduced-motion: reduce)");
  const systemReduceTransparency = useMq("(prefers-reduced-transparency: reduce)");
  const systemContrast = useMq("(prefers-contrast: more)");
  const sceneId = useScene();
  const weak = useSyncExternalStore(noopSubscribe, detectWeakDevice, serverWeakDevice);
  const lowEnd = resolve(settings.performanceMode, weak);

  useEffect(() => {
    useSettings.persist.rehydrate();
  }, []);

  const env: Environment = {
    glassClarity: settings.glassClarity,
    reduceMotion: resolve(settings.reduceMotion, systemReduceMotion),
    reduceTransparency: resolve(settings.reduceTransparency, systemReduceTransparency),
    highContrast: resolve(settings.increaseContrast, systemContrast),
    textScale: settings.textScale,
    lowEnd,
  };

  useEffect(() => {
    const html = document.documentElement;
    const attr = (name: string, value: string | null) =>
      value === null ? html.removeAttribute(name) : html.setAttribute(name, value);
    const tri = (v: Tristate) => (v === "system" ? null : v);
    attr("data-reduce-motion", tri(settings.reduceMotion));
    attr("data-reduce-transparency", tri(settings.reduceTransparency));
    attr(
      "data-contrast",
      settings.increaseContrast === "system" ? null : settings.increaseContrast === "on" ? "more" : "standard",
    );
    if (useSettings.persist.hasHydrated()) {
      attr("data-perf", resolve(useSettings.getState().performanceMode, weak) ? "low" : null);
      attr("data-reveal", env.reduceMotion || lowEnd ? null : "");
    }
    html.style.setProperty("--glass-clarity", String(settings.glassClarity));
    html.style.setProperty("--type-scale", String(settings.textScale));
  }, [settings.reduceMotion, settings.reduceTransparency, settings.increaseContrast, settings.glassClarity, settings.textScale, env.reduceMotion, lowEnd, weak]);

  useEffect(() => watchKeyboard(), []);

  useEffect(() => {
    setThemeColors(scenes.find((s) => s.id === sceneId)?.themeColor ?? systemColors.groupedBackground);
  }, [sceneId]);

  return (
    <EnvironmentContext value={env}>
      <MotionConfig reducedMotion={env.reduceMotion || lowEnd ? "always" : "never"}>{children}</MotionConfig>
    </EnvironmentContext>
  );
}
