"use client";

import { Drawer } from "@base-ui/react/drawer";
import { NavigationRoot, TabViews } from "@/navigation/navigation-root";
import type { NavigatorConfig } from "@/navigation/types";
import { NetworkStatus } from "./network-status";
import { OverlayHost, SheetHost } from "./presentation/host";
import { useScene } from "./scene/context";
import { TabBar } from "./tab-bar";

export function AppShell({
  config,
  initialPathname,
  visibleTabs,
}: {
  config: NavigatorConfig;
  initialPathname: string;
  visibleTabs?: string[];
}) {
  const scene = useScene();
  return (
    <NavigationRoot config={config} initialPathname={initialPathname}>
      <a
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-[calc(env(safe-area-inset-top)+var(--space-2))] focus:left-(--margin) focus:z-(--z-toast) focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:type-body focus:text-tint focus:shadow-lg"
      >
        跳到主要内容
      </a>
      <Drawer.Provider>
        <div data-app-shell className="stack fixed inset-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-scrim-push">
          <Drawer.IndentBackground className="bg-scrim-push" />
          <Drawer.Indent
            data-scene={scene}
            className="layer-keep stack origin-center grid-rows-[minmax(0,1fr)] overflow-hidden isolate bg-canvas motion-spring transition-transform duration-(--spring-present-dur) ease-(--spring-present) data-active:scale-[calc(var(--indent-scale)+(1-var(--indent-scale))*var(--drawer-swipe-progress,0))] data-active:rounded-(--r-indent) reduced:data-active:scale-100 lowperf:will-change-auto lowperf:data-active:scale-100"
          >
            <TabViews />
            <TabBar tabs={visibleTabs} />
            <NetworkStatus />
          </Drawer.Indent>
        </div>
        <SheetHost />
      </Drawer.Provider>
      <OverlayHost />
    </NavigationRoot>
  );
}
