import { createStore } from "zustand/vanilla";
import type { NavChange, NavigatorConfig, Params, PushOptions, Route, RouteTarget } from "./types";

export type NavState = {
  activeTab: string;
  stacks: Record<string, Route[]>;
  change: NavChange | null;
  titles: Record<string, string>;
  tabBarHidden: Record<string, boolean>;
  tabBarCompact: boolean;
  tabBarAccessory: Record<string, boolean>;
  accessoryHost: HTMLElement | null;
};

export type NavActions = {
  push: (target: RouteTarget, opts?: PushOptions) => void;
  pop: (opts?: { animated?: boolean }) => void;
  replace: (target: RouteTarget) => void;
  popTo: (key: string, opts?: { animated?: boolean }) => void;
  popToRoot: (tab?: string, opts?: { animated?: boolean }) => void;
  selectTab: (tab: string) => void;
  syncFromUrl: (pathname: string, opts?: { animated?: boolean }) => void;
  setTitle: (key: string, title: string) => void;
  setTabBarHidden: (key: string, hidden: boolean) => void;
  setTabBarCompact: (compact: boolean) => void;
  setTabBarAccessory: (key: string, on: boolean) => void;
  setAccessoryHost: (el: HTMLElement | null) => void;
};

export type NavStore = ReturnType<typeof createNavStore>;


const split = (path: string) => path.split("/").filter(Boolean);

export function matchPath(pattern: string, pathname: string): Params | null {
  const a = split(pattern);
  const b = split(pathname);
  if (a.length !== b.length) return null;
  const params: Params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) {
      try {
        params[a[i].slice(1)] = decodeURIComponent(b[i]);
      } catch {
        return null;
      }
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}

function buildPath(pattern: string, params: Params = {}) {
  const path = split(pattern)
    .map((s) => (s.startsWith(":") ? encodeURIComponent(params[s.slice(1)] ?? "") : s))
    .join("/");
  return `/${path}`;
}

export function createNavStore(config: NavigatorConfig, initialPathname: string) {
  let seq = 0;
  const makeRoute = (t: RouteTarget): Route => ({ key: `${t.name}#${++seq}`, name: t.name, params: t.params ?? {} });
  const def = (name: string) => {
    const d = config.routes[name];
    if (!d) throw new Error(`未注册的路由：${name}`);
    return d;
  };
  const base = config.basePath ?? "";
  const rootOf = (tab: string) => config.tabs.find((t) => t.id === tab)!.root;
  const sameTarget = (a: RouteTarget, b: RouteTarget) =>
    a.name === b.name && buildPath(def(a.name).path, a.params) === buildPath(def(b.name).path, b.params);

  const parse = (pathname: string): RouteTarget => {
    const rel = base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
    for (const [name, d] of Object.entries(config.routes)) {
      const params = matchPath(d.path, rel);
      if (params) return { name, params };
    }
    return config.fallback;
  };

  const buildStack = (target: RouteTarget): Route[] => {
    const chain: RouteTarget[] = [target];
    for (let p = def(target.name).parent?.(target.params ?? {}); p && chain.length < 10; ) {
      chain.unshift(p);
      p = def(p.name).parent?.(p.params ?? {});
    }
    const root = rootOf(def(target.name).tab);
    if (!sameTarget(chain[0], root)) chain.unshift(root);
    return chain.map(makeRoute);
  };

  const initialTarget = parse(initialPathname);
  const initialTab = def(initialTarget.name).tab;
  const stacks: Record<string, Route[]> = {};
  for (const t of config.tabs) stacks[t.id] = t.id === initialTab ? buildStack(initialTarget) : [makeRoute(t.root)];

  return createStore<NavState & NavActions>()((set, get) => {
    const setStack = (tab: string, stack: Route[], change: NavChange, extra?: Partial<NavState>) =>
      set((s) => ({ stacks: { ...s.stacks, [tab]: stack }, change, tabBarCompact: false, ...extra }));

    return {
      activeTab: initialTab,
      stacks,
      change: null,
      titles: {},
      tabBarHidden: {},
      tabBarCompact: false,
      tabBarAccessory: {},
      accessoryHost: null,

      push(target, { animated = true, source = null } = {}) {
        const tab = def(target.name).tab;
        const { activeTab, stacks } = get();
        const stack = stacks[tab];
        if (sameTarget(stack[stack.length - 1], target) && tab === activeTab) return;
        setStack(tab, [...stack, makeRoute(target)], { kind: "push", tab, animated: animated && tab === activeTab, source }, {
          activeTab: tab,
        });
      },

      pop({ animated = true } = {}) {
        const { activeTab, stacks } = get();
        const stack = stacks[activeTab];
        if (stack.length <= 1) return;
        setStack(activeTab, stack.slice(0, -1), { kind: "pop", tab: activeTab, animated });
      },

      replace(target) {
        const { activeTab, stacks } = get();
        const stack = stacks[activeTab];
        setStack(activeTab, [...stack.slice(0, -1), makeRoute(target)], { kind: "replace", tab: activeTab, animated: false });
      },

      popTo(key, { animated = true } = {}) {
        const { activeTab, stacks } = get();
        const index = stacks[activeTab].findIndex((r) => r.key === key);
        if (index < 0 || index === stacks[activeTab].length - 1) return;
        setStack(activeTab, stacks[activeTab].slice(0, index + 1), { kind: "pop", tab: activeTab, animated });
      },

      popToRoot(tab = get().activeTab, { animated = true } = {}) {
        const stack = get().stacks[tab];
        if (stack.length <= 1) return;
        setStack(tab, stack.slice(0, 1), { kind: "pop", tab, animated });
      },

      selectTab(tab) {
        if (tab === get().activeTab) return;
        set({ activeTab: tab, change: { kind: "tab", tab, animated: false }, tabBarCompact: false });
      },

      syncFromUrl(pathname, { animated = false } = {}) {
        const target = parse(pathname);
        const tab = def(target.name).tab;
        const stack = get().stacks[tab];
        const index = stack.findIndex((r) => sameTarget(r, target));
        if (index >= 0) {
          if (index === stack.length - 1) {
            set({ activeTab: tab, change: { kind: "tab", tab, animated: false, fromUrl: true } });
          } else {
            setStack(tab, stack.slice(0, index + 1), { kind: "pop", tab, animated, fromUrl: true }, { activeTab: tab });
          }
          return;
        }
        const parent = def(target.name).parent?.(target.params ?? {});
        const top = stack[stack.length - 1];
        if (parent && sameTarget(top, parent)) {
          setStack(tab, [...stack, makeRoute(target)], { kind: "push", tab, animated, fromUrl: true }, { activeTab: tab });
        } else {
          setStack(tab, buildStack(target), { kind: "reset", tab, animated: false, fromUrl: true }, { activeTab: tab });
        }
      },

      setTabBarHidden(key, hidden) {
        if (!!get().tabBarHidden[key] === hidden) return;
        set((s) => ({ tabBarHidden: { ...s.tabBarHidden, [key]: hidden } }));
      },

      setTabBarCompact(compact) {
        if (get().tabBarCompact !== compact) set({ tabBarCompact: compact });
      },

      setTabBarAccessory(key, on) {
        if (!!get().tabBarAccessory[key] === on) return;
        set((s) => ({ tabBarAccessory: { ...s.tabBarAccessory, [key]: on } }));
      },

      setAccessoryHost(el) {
        if (get().accessoryHost !== el) set({ accessoryHost: el });
      },

      setTitle(key, title) {
        if (get().titles[key] === title) return;
        set((s) => ({ titles: { ...s.titles, [key]: title } }));
      },
    };
  });
}

export function routeUrl(config: NavigatorConfig, route: RouteTarget) {
  const path = buildPath(config.routes[route.name].path, route.params);
  const base = config.basePath ?? "";
  return base && path === "/" ? base : `${base}${path}`;
}
