import type { ComponentType } from "react";

export type Params = Record<string, string>;

export type RouteTarget = { name: string; params?: Params };

export type Route = { key: string; name: string; params: Params };

export type ScreenProps = { params: Params; route: Route };

type RouteDef = {
  path: string;
  tab: string;
  screen: ComponentType<ScreenProps>;
  parent?: (params: Params) => RouteTarget | null;
  hidesTabBar?: boolean;
};

type TabIcon = ComponentType<{ className?: string; strokeWidth?: number; fill?: string }>;

type TabDef = {
  id: string;
  title: string;
  icon: TabIcon;
  root: RouteTarget;
};

export type NavigatorConfig = {
  basePath?: string;
  routes: Record<string, RouteDef>;
  tabs: TabDef[];
  fallback: RouteTarget;
};

export type NavChange = {
  kind: "push" | "pop" | "replace" | "reset" | "tab";
  tab: string;
  animated: boolean;
  fromUrl?: boolean;
  source?: HTMLElement | null;
};

export type PushOptions = { animated?: boolean; source?: HTMLElement | null };
