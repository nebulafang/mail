"use client";

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { NavigatorContext, useNavigator, type Navigator } from "./context";
import { NavigationStack } from "./navigation-stack";
import { createNavStore, routeUrl } from "./store";
import type { NavigatorConfig } from "./types";

const samePath = (a: string, b: string) => {
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return a === b;
  }
};

export function NavigationRoot({
  config,
  initialPathname,
  children,
}: {
  config: NavigatorConfig;
  initialPathname: string;
  children: React.ReactNode;
}) {
  const [nav] = useState<Navigator>(() => ({
    config,
    store: createNavStore(config, initialPathname),
    scrollers: new Map(),
    primers: new Map(),
  }));

  useEffect(() => {
    const { store } = nav;
    let ignorePop = false;
    const currentUrl = () => {
      const s = store.getState();
      const stack = s.stacks[s.activeTab];
      return routeUrl(config, stack[stack.length - 1]);
    };
    const depth = (): number => (window.history.state?.navDepth as number | undefined) ?? 0;
    const replace = (url: string) => window.history.replaceState({ ...window.history.state, navDepth: depth() }, "", url);

    if (!samePath(location.pathname, currentUrl())) replace(currentUrl());

    const unsubscribe = store.subscribe((s, prev) => {
      const change = s.change;
      if (!change || change === prev.change) return;
      delete document.documentElement.dataset.firstLoad;
      if (change.fromUrl) return;
      const next = currentUrl();
      const popped = prev.stacks[change.tab].length - s.stacks[change.tab].length;
      if (change.kind === "push") {
        window.history.pushState({ navDepth: depth() + 1 }, "", next);
      } else if (change.kind === "pop" && popped === 1 && depth() > 0) {
        ignorePop = true;
        window.history.back();
      } else if (!samePath(location.pathname, next)) {
        replace(next);
      }
    });

    const onPopState = () => {
      if (ignorePop) {
        ignorePop = false;
        if (!samePath(location.pathname, currentUrl())) replace(currentUrl());
        return;
      }
      store.getState().syncFromUrl(location.pathname, { animated: true });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, [nav, config]);

  return <NavigatorContext value={nav}>{children}</NavigatorContext>;
}

export function TabViews() {
  const { config, store } = useNavigator();
  const activeTab = useStore(store, (s) => s.activeTab);
  const [visited, setVisited] = useState(() => new Set([activeTab]));
  if (!visited.has(activeTab)) setVisited(new Set([...visited, activeTab]));

  return (
    <main id="content" tabIndex={-1} className="relative outline-none">
      {config.tabs.map((tab) =>
        visited.has(tab.id) ? (
          <section
            key={tab.id}
            aria-label={tab.title}
            inert={tab.id !== activeTab}
            className="absolute inset-0 data-[hidden]:invisible data-[hidden]:[content-visibility:hidden]"
            data-hidden={tab.id !== activeTab ? "" : undefined}
          >
            <NavigationStack tab={tab.id} />
          </section>
        ) : null,
      )}
    </main>
  );
}
