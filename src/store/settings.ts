"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_SCENE, SCENE_COOKIE, type SceneId } from "@/design-system/scenes";
import { SETTINGS_KEY } from "@/environment/perf-script";

export type Tristate = "system" | "on" | "off";

export type DisplaySettings = {
  glassClarity: number;
  reduceMotion: Tristate;
  reduceTransparency: Tristate;
  increaseContrast: Tristate;
  performanceMode: Tristate;
  textScale: number;
  scene: SceneId;
};

type SettingsStore = DisplaySettings & {
  set: (patch: Partial<DisplaySettings>) => void;
  reset: () => void;
};

export const defaultDisplaySettings: DisplaySettings = {
  glassClarity: 0.5,
  reduceMotion: "system",
  reduceTransparency: "system",
  increaseContrast: "system",
  performanceMode: "system",
  textScale: 1,
  scene: DEFAULT_SCENE,
};

function rememberScene(scene: SceneId) {
  document.cookie = `${SCENE_COOKIE}=${scene}; path=/; max-age=31536000; samesite=lax`;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultDisplaySettings,
      set: (patch) => {
        set(patch);
        if (patch.scene) rememberScene(patch.scene);
      },
      reset: () => {
        set(defaultDisplaySettings);
        rememberScene(defaultDisplaySettings.scene);
      },
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) rememberScene(state.scene);
      },
      partialize: (s): DisplaySettings => ({
        glassClarity: s.glassClarity,
        reduceMotion: s.reduceMotion,
        reduceTransparency: s.reduceTransparency,
        increaseContrast: s.increaseContrast,
        performanceMode: s.performanceMode,
        textScale: s.textScale,
        scene: s.scene,
      }),
    },
  ),
);
