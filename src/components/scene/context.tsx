"use client";

import { createContext, use, useSyncExternalStore } from "react";
import { DEFAULT_SCENE, type SceneId } from "@/design-system/scenes";
import { useSettings } from "@/store/settings";

const SceneContext = createContext<SceneId>(DEFAULT_SCENE);

export const SceneProvider = SceneContext;

const subscribe = (onChange: () => void) => useSettings.persist.onFinishHydration(onChange);
const hydrated = () => useSettings.persist.hasHydrated();
const notHydrated = () => false;

export function useScene() {
  const initial = use(SceneContext);
  const stored = useSettings((s) => s.scene);
  return useSyncExternalStore(subscribe, hydrated, notHydrated) ? stored : initial;
}
