"use client";

import { AnimatePresence, m, useTransform } from "motion/react";
import { haptic } from "@/design-system/haptics";
import { scales, springs } from "@/design-system/motion";
import { useKeyboardVisible } from "@/environment/keyboard";
import { useLensDrag } from "@/hooks/use-lens-drag";
import { useNavigator, useNavState } from "@/navigation/context";
import { routeUrl } from "@/navigation/store";
import { cn } from "@/lib/utils";

export function TabBar({ tabs: visibleIds }: { tabs?: string[] }) {
  const { config, store, scrollers } = useNavigator();
  const keyboardVisible = useKeyboardVisible();
  const activeTab = useNavState((s) => s.activeTab);
  const top = useNavState((s) => {
    const stack = s.stacks[s.activeTab];
    return stack[stack.length - 1];
  });
  const tabs = config.tabs.filter((t) => !visibleIds || visibleIds.includes(t.id) || t.id === activeTab);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeTab));
  const hiddenByScreen = useNavState((s) => !!s.tabBarHidden[top.key]);
  const hidden = !!config.routes[top.name].hidesTabBar || hiddenByScreen || keyboardVisible;
  const compact = useNavState((s) => s.tabBarCompact) && !hidden;
  const hasAccessory = useNavState((s) => !!s.tabBarAccessory[top.key]) && !hidden;
  const setAccessoryHost = useNavState((s) => s.setAccessoryHost);

  const { containerRef: barRef, pos, lens } = useLensDrag({
    count: tabs.length,
    activeIndex,
    spring: springs.tab,
    lensScale: scales.tabLens,
    enabled: !compact,
    onCommit: (index) => store.getState().selectTab(tabs[index].id),
  });
  const indicatorX = useTransform(pos, (p) => `${p * 100}%`);

  const select = (index: number) => {
    const s = store.getState();
    if (s.tabBarCompact) {
      haptic("selection");
      return s.setTabBarCompact(false);
    }
    const tab = tabs[index];
    if (tab.id !== s.activeTab) {
      haptic("selection");
      return s.selectTab(tab.id);
    }
    const stack = s.stacks[tab.id];
    if (stack.length > 1) s.popToRoot(tab.id);
    else scrollers.get(stack[0].key)?.();
  };

  return (
    <nav
      aria-label="标签栏"
      className={cn(
        "pointer-events-none relative z-(--z-tabbar) flex justify-center self-end px-(--tab-bar-inset-x) pb-(--bar-float-gap)",
        "motion-spring transition-[translate,opacity] duration-(--spring-smooth-dur) ease-(--spring-smooth)",
        hidden && "translate-y-(--bar-hide-offset) opacity-0",
      )}
    >
      <div
        aria-hidden
        className="scroll-edge-bottom pointer-events-none absolute inset-x-0 bottom-0 h-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+var(--edge-fade-h))]"
        style={{ "--scroll-edge": "var(--scene-edge-bottom, var(--bg-grouped))" } as React.CSSProperties}
      />
      <div className="relative flex w-full max-w-(--tab-bar-max-w) items-center justify-between gap-(--space-3)">
        <div
          ref={barRef}
          style={{
            width: compact
              ? "var(--tab-bar-compact-w)"
              : hasAccessory
                ? "calc(100% - var(--accessory-size) - var(--space-3))"
                : "100%",
          }}
          className={cn(
            "lg pointer-events-auto relative flex h-(--tab-bar-h) touch-pan-y overflow-hidden rounded-full p-(--tab-bar-pad)",
            "motion-spring transition-[width] duration-(--spring-tab-dur) ease-(--spring-tab)",
            hidden && "pointer-events-none",
          )}
        >
          <m.span
            aria-hidden
            style={{ x: indicatorX, scale: lens, width: `calc((100% - 2 * var(--tab-bar-pad)) / ${tabs.length})` }}
            className={cn(
              "absolute inset-y-(--tab-bar-pad) left-(--tab-bar-pad) rounded-full bg-tab-lens transition-opacity duration-200",
              compact && "opacity-0",
            )}
          />
          {tabs.map((tab, index) => {
            const active = index === activeIndex;
            const Icon = tab.icon;
            const collapsed = compact && !active;
            return (
              <a
                key={tab.id}
                href={routeUrl(config, tab.root)}
                draggable={false}
                aria-current={active ? "page" : undefined}
                aria-label={compact && active ? `${tab.title}，展开标签栏` : tab.title}
                tabIndex={collapsed ? -1 : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  select(index);
                }}
                className={cn(
                  "pressable relative z-(--z-raised) flex min-w-0 basis-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full [--press-scale:var(--press-scale-tab)]",
                  "motion-spring transition-[flex-grow,opacity] duration-(--spring-tab-dur) ease-(--spring-tab)",
                  collapsed ? "grow-0 opacity-0" : "grow",
                  active ? "text-tint" : "text-label",
                )}
              >
                <Icon className="size-(--tab-icon) shrink-0" strokeWidth={active ? 2.3 : 1.9} />
                <span className="type-caption2 font-semibold whitespace-nowrap">{tab.title}</span>
              </a>
            );
          })}
        </div>
        <AnimatePresence>
          {hasAccessory && (
            <m.div
              key="accessory"
              ref={setAccessoryHost}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6, transition: springs.dismiss }}
              transition={springs.compact}
              className="pointer-events-auto absolute right-0 grid size-(--accessory-size) place-items-center"
            />
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
