"use client";

import { ChevronLeft } from "lucide-react";
import { AnimatePresence, m, useMotionValueEvent, useTransform, type MotionValue } from "motion/react";
import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchField } from "@/components/search-field";
import { IconButton, RefreshSpinner, Text } from "@/design-system/atoms";
import { gesture, heroMotion, presets, springs } from "@/design-system/motion";
import { useEnvironment } from "@/environment/environment";
import { useLongPress } from "@/hooks/use-long-press";
import { REFRESH_THRESHOLD, usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useIsFocused, useNavigator, useNavState, useRoute } from "@/navigation/context";
import { present } from "@/presentation/api";
import { cn } from "@/lib/utils";

type ScreenContextValue = {
  scroller: React.RefObject<HTMLDivElement | null>;
  scrollElement: HTMLDivElement | null;
  pull: MotionValue<number>;
};
const ScreenContext = createContext<ScreenContextValue | null>(null);
export const useScreen = () => {
  const ctx = use(ScreenContext);
  if (!ctx) throw new Error("需要放在 <Screen> 里");
  return ctx;
};

export type ScreenProps = {
  title: string;
  subtitle?: React.ReactNode;
  titleDisplay?: "large" | "inline" | "none" | "reveal";
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  accessory?: React.ReactNode;
  toolbar?: React.ReactNode;
  hidesTabBar?: boolean;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; autoFocus?: boolean };
  header?: React.ReactNode;
  refreshable?: () => Promise<unknown>;
  elastic?: boolean;
  lateChrome?: boolean;
  background?: "grouped" | "plain";
  children: React.ReactNode;
};

export function Screen({
  title,
  subtitle,
  titleDisplay = "large",
  leading,
  trailing,
  accessory,
  toolbar,
  hidesTabBar: hideTabBarNow = false,
  search,
  header,
  refreshable,
  elastic,
  lateChrome,
  background = "grouped",
  children,
}: ScreenProps) {
  const { route, index } = useRoute();
  const [bornWithToolbar] = useState(!!toolbar);
  const chromePhase = lateChrome ? "chrome" : undefined;
  const { config, scrollers, store } = useNavigator();
  const env = useEnvironment();
  const hidesTabBar = !!config.routes[route.name].hidesTabBar || hideTabBarNow;
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;
    setScrollElement(el);
  }, []);
  const { content: refreshContent, pull, refreshing } = usePullToRefresh(scroller, refreshable, { elastic });
  const [searching, setSearching] = useState(false);
  const scrollBehavior: ScrollBehavior = env.reduceMotion ? "auto" : "smooth";
  const focused = useIsFocused();
  const accessoryHost = useNavState((s) => s.accessoryHost);
  const hasAccessory = !!accessory;
  const titleScale = useTransform(pull, [0, gesture.pullToRefresh.maxPull], [1, heroMotion.pullScale]);

  useEffect(() => store.getState().setTitle(route.key, title), [store, route.key, title]);
  useEffect(() => {
    store.getState().setTabBarHidden(route.key, hideTabBarNow);
    return () => store.getState().setTabBarHidden(route.key, false);
  }, [store, route.key, hideTabBarNow]);
  useEffect(() => {
    store.getState().setTabBarAccessory(route.key, hasAccessory);
    return () => store.getState().setTabBarAccessory(route.key, false);
  }, [store, route.key, hasAccessory]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !focused) return;
    const { setTabBarCompact } = store.getState();
    let last = el.scrollTop;
    let travel = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = el.scrollTop;
      const delta = y - last;
      last = y;
      if (y <= 8) {
        travel = 0;
        return setTabBarCompact(false);
      }
      if (el.scrollHeight - el.clientHeight - y <= 2) return;
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;
      if (travel > heroMotion.compactTravel && y > heroMotion.compactAfter) setTabBarCompact(true);
      else if (travel < -heroMotion.expandTravel) setTabBarCompact(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [focused, store]);
  useEffect(() => {
    scrollers.set(route.key, () => scroller.current?.scrollTo({ top: 0, behavior: scrollBehavior }));
    return () => void scrollers.delete(route.key);
  }, [scrollers, route.key, scrollBehavior]);

  const large = titleDisplay === "large";
  const TitleTag = focused ? "h1" : "div";
  const collapsed = large && (searching || !!search?.value);
  const titleRef = useRef<HTMLDivElement>(null);
  const [titleHeight, setTitleHeight] = useState(0);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setTitleHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [large]);

  const bottomSpace = toolbar || !hidesTabBar;
  const edgeColor = {
    "--scroll-edge": background === "grouped" ? "var(--scene-edge-top, var(--bg-grouped))" : "var(--bg)",
  } as React.CSSProperties;

  return (
    <ScreenContext value={{ scroller, scrollElement, pull }}>
      <div className={cn("scroll-scope stack absolute inset-0 grid-rows-[minmax(0,1fr)]", background === "plain" && "bg-plain")}>
        <div
          ref={attachScroller}
          className={cn(
            "screen-scroller scroll-source touch-pan-y pt-[calc(env(safe-area-inset-top)+var(--nav-bar-h))]",
            bottomSpace
              ? "pb-[calc(var(--tab-bar-h)+var(--bar-float-gap)+var(--content-pad-bottom))]"
              : "pb-[calc(env(safe-area-inset-bottom)+var(--content-pad-bottom))]",
          )}
          style={edgeColor}
        >
          <div ref={refreshContent} className="relative mx-auto w-full max-w-(--content-max-w)">
            {refreshable && <RefreshIndicator pull={pull} refreshing={refreshing} />}
            <m.div initial={false} animate={{ y: collapsed ? -titleHeight : 0 }} transition={springs.smooth}>
              {large && (
                <m.div
                  ref={titleRef}
                  initial={false}
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={springs.smooth}
                  aria-hidden={collapsed || undefined}
                  className="pb-(--large-title-pad-bottom)"
                >
                  <m.div style={{ scale: titleScale }} className="origin-left">
                    <div className="scroll-title-shrink">
                      <TitleTag className="on-scene px-(--margin) pt-(--large-title-pad-top) type-large-title text-label">{title}</TitleTag>
                      {subtitle && <p className="on-scene px-(--margin) type-subheadline text-label-2">{subtitle}</p>}
                    </div>
                  </m.div>
                </m.div>
              )}
              {!large && <div className="h-3" />}
              {search && (
                <div className="px-(--margin) pb-3">
                  <SearchField
                    value={search.value}
                    onChange={search.onChange}
                    placeholder={search.placeholder}
                    autoFocus={search.autoFocus}
                    onFocusChange={(focused) => {
                      setSearching(focused);
                      if (focused) scroller.current?.scrollTo({ top: 0, behavior: scrollBehavior });
                    }}
                  />
                </div>
              )}
              {header && <div className="px-(--margin) pb-3">{header}</div>}
              {children}
            </m.div>
          </div>
        </div>

        <header className="pointer-events-none relative z-(--z-nav) self-start pt-safe-area" style={edgeColor}>
          <div
            aria-hidden
            data-nav-edge
            className={cn(
              "scroll-edge-top absolute inset-x-0 top-0 h-[calc(100%+var(--edge-fade-h))]",
              collapsed ? "scroll-revealed" : "scroll-reveal-edge",
            )}
          />
          <div
            data-zoom-fade={chromePhase}
            className="relative mx-auto grid h-(--nav-bar-h) max-w-(--content-max-w) grid-cols-[1fr_auto_1fr] items-center gap-2 px-(--margin)"
          >
            <div className="pointer-events-auto flex min-w-0 items-center justify-start gap-2">
              {leading ?? (index > 0 && <BackButton />)}
            </div>
            <div
              data-nav-title
              className={cn(
                "on-scene max-w-(--nav-title-max-w) min-w-0 text-center",
                titleDisplay === "none" ? "opacity-0" : titleDisplay === "reveal" ? "scroll-reveal-title-late" : collapsed ? "scroll-revealed" : large && "scroll-reveal-title",
              )}
            >
              <Text as={titleDisplay === "inline" && focused ? "h1" : "div"} style="headline" lines={1} align="center">
                {title}
              </Text>
              {subtitle && large && <div className="truncate type-caption1 text-label-2">{subtitle}</div>}
            </div>
            <div className="pointer-events-auto flex min-w-0 items-center justify-end gap-2">{trailing}</div>
          </div>
        </header>

        <AnimatePresence>
          {toolbar && (
            <BottomBar key="toolbar" still={lateChrome && bornWithToolbar} phase={chromePhase}>
              {toolbar}
            </BottomBar>
          )}
        </AnimatePresence>
        {accessory && focused && accessoryHost && createPortal(accessory, accessoryHost)}
      </div>
    </ScreenContext>
  );
}

function RefreshIndicator({ pull, refreshing }: { pull: MotionValue<number>; refreshing: boolean }) {
  const [petals, setPetals] = useState(0);
  useMotionValueEvent(pull, "change", (v) => {
    const next = Math.min(8, Math.floor((v / REFRESH_THRESHOLD) * 8));
    if (next !== petals) setPetals(next);
  });
  const opacity = useTransform(pull, [0, 20], [0, 1]);
  return (
    <m.div
      aria-hidden={!refreshing}
      role={refreshing ? "status" : undefined}
      aria-label={refreshing ? "正在刷新" : undefined}
      style={{ opacity: refreshing ? 1 : opacity }}
      className="on-scene pointer-events-none absolute inset-x-0 -top-(--refresh-indicator-offset) flex h-(--refresh-indicator-h) items-center justify-center text-label-2"
    >
      <RefreshSpinner petals={petals} spinning={refreshing} className="size-7" />
    </m.div>
  );
}

function BackButton() {
  const { tab } = useRoute();
  const stack = useNavState((s) => s.stacks[tab]);
  const titles = useNavState((s) => s.titles);
  const { store, primers } = useNavigator();
  const previous = stack[stack.length - 2];
  const prevTitle = previous ? titles[previous.key] : undefined;

  const longPress = useLongPress(
    async (el, { pointer }) => {
      const history = stack.slice(0, -1).reverse();
      const picked = await present.menu({
        anchor: el,
        pointer,
        sections: [{ items: history.map((r) => ({ id: r.key, label: titles[r.key] ?? "返回" })) }],
      });
      if (picked) store.getState().popTo(picked);
    },
    { pressFeedback: false },
  );

  return (
    <IconButton
      label={prevTitle ? `返回“${prevTitle}”` : "返回"}
      onClick={() => !longPress.fired() && store.getState().pop()}
      {...longPress.handlers}
      onPointerDown={(e) => {
        longPress.handlers.onPointerDown(e);
        if (e.button === 0) primers.get(tab)?.(true);
      }}
    >
      <ChevronLeft strokeWidth={2.4} className="-ml-0.5" />
    </IconButton>
  );
}

function BottomBar({ children, still, phase }: { children: React.ReactNode; still?: boolean; phase?: string }) {
  return (
    <m.div {...presets.barIn} initial={still ? false : presets.barIn.initial} data-bottom-bar className="pointer-events-none relative z-(--z-nav) self-end">
      <div
        aria-hidden
        className="scroll-edge-bottom absolute inset-x-0 bottom-0 h-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom)+var(--edge-fade-h))]"
      />
      <div
        data-zoom-fade={phase}
        className="relative mx-auto flex max-w-(--content-max-w) translate-y-[calc(-1*var(--keyboard-inset,0px))] items-center justify-between gap-3 px-(--margin) pb-(--bar-float-gap) [&>*]:pointer-events-auto"
      >
        {children}
      </div>
    </m.div>
  );
}

export function ToolbarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("lg pointer-events-auto flex h-(--control-h) items-center rounded-full px-0.5", className)}>
      {children}
    </div>
  );
}
