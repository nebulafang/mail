import { systemColors } from "./colors";

export type SceneId = "sakura" | "starry" | "summer" | "none";

export const DEFAULT_SCENE: SceneId = "none";

export const scenes: { id: SceneId; label: string; themeColor: { light: string; dark: string } }[] = [
  { id: "none", label: "无", themeColor: systemColors.groupedBackground },
  { id: "sakura", label: "樱花", themeColor: { light: "#fbe4ee", dark: "#1b1433" } },
  { id: "starry", label: "星空", themeColor: { light: "#e9e3ff", dark: "#070b26" } },
  { id: "summer", label: "晴空", themeColor: { light: "#8fc9ff", dark: "#0a1830" } },
];

export const SCENE_COOKIE = "scene";

export const isSceneId = (value: unknown): value is SceneId => scenes.some((s) => s.id === value);
