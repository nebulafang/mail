"use client";

import { createContext, use } from "react";
import { useStore } from "zustand";
import { routeUrl, type NavActions, type NavState, type NavStore } from "./store";
import type { NavigatorConfig, Route, RouteTarget } from "./types";

export type Navigator = {
  config: NavigatorConfig;
  store: NavStore;
  scrollers: Map<string, () => void>;
  primers: Map<string, (on: boolean) => void>;
};

export const NavigatorContext = createContext<Navigator | null>(null);

export type RouteInfo = { route: Route; tab: string; index: number; settled: boolean };
export const RouteContext = createContext<RouteInfo | null>(null);

export function useNavigator() {
  const nav = use(NavigatorContext);
  if (!nav) throw new Error("需要放在 <NavigationRoot> 里");
  return nav;
}

export function useNavState<T>(selector: (s: NavState & NavActions) => T) {
  return useStore(useNavigator().store, selector);
}

export function useNavigation() {
  const { store, config } = useNavigator();
  const s = store.getState();
  return {
    push: s.push,
    pop: s.pop,
    replace: s.replace,
    popTo: s.popTo,
    popToRoot: s.popToRoot,
    selectTab: s.selectTab,
    href: (target: RouteTarget) => routeUrl(config, target),
  };
}

export function useRoute() {
  const info = use(RouteContext);
  if (!info) throw new Error("需要放在导航栈的页面里");
  return info;
}

export function useIsFocused() {
  const info = use(RouteContext);
  return useNavState((s) => {
    if (!info) return false;
    const stack = s.stacks[info.tab];
    return s.activeTab === info.tab && stack[stack.length - 1]?.key === info.route.key;
  });
}
