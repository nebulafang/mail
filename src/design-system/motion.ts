import type { Transition } from "motion/react";

export const springs = {
  smooth: { type: "spring", visualDuration: 0.5, bounce: 0 },
  snappy: { type: "spring", visualDuration: 0.35, bounce: 0.15 },
  bouncy: { type: "spring", visualDuration: 0.5, bounce: 0.3 },
  press: { type: "spring", visualDuration: 0.3, bounce: 0.2 },
  push: { type: "spring", visualDuration: 0.42, bounce: 0 },
  present: { type: "spring", visualDuration: 0.45, bounce: 0.08 },
  morph: { type: "spring", visualDuration: 0.38, bounce: 0.18 },
  alert: { type: "spring", visualDuration: 0.4, bounce: 0.22 },
  toast: { type: "spring", visualDuration: 0.5, bounce: 0.25 },
  tab: { type: "spring", visualDuration: 0.32, bounce: 0.2 },
  segment: { type: "spring", visualDuration: 0.3, bounce: 0.15 },
  listInsert: { type: "spring", visualDuration: 0.45, bounce: 0.2 },
  listRemove: { type: "spring", visualDuration: 0.35, bounce: 0 },
  dismiss: { type: "spring", visualDuration: 0.3, bounce: 0 },
  settle: { type: "spring", duration: 0.32, bounce: 0 },
  counter: { type: "spring", visualDuration: 0.9, bounce: 0 },
  toolbar: { type: "spring", visualDuration: 0.42, bounce: 0.2 },
  burst: { type: "spring", visualDuration: 0.6, bounce: 0 },
  hero: { type: "spring", visualDuration: 0.5, bounce: 0.18 },
  compact: { type: "spring", visualDuration: 0.4, bounce: 0.16 },
} satisfies Record<string, Transition>;

export const fade: Transition = { duration: 0.2, ease: "easeOut" };

export const stagger = { base: 0.05, chart: 0.04, row: 0.05, initialDelay: 0.1 } as const;

export const PUSH_PARALLAX = 0.3;
export const PUSH_DIM = 0.12;

export const scales = {
  tabLens: 1.18,
  segmentLens: 1.08,
  lift: 1.03,
  contextHold: 0.97,
} as const;

export const scrollRanges = {
  newMailShow: 200,
  newMailHide: 120,
} as const;

export const gesture = {
  swipeRow: { fullSwipeTrailing: 0.6, fullSwipeLeading: 0.5, flickVelocity: 400, actionWidth: 76, elastic: 0.15 },
  toast: { dismissDistance: -28, dismissVelocity: -350, expandDistance: 36 },
  pullToRefresh: { threshold: 76, hold: 56, maxPull: 140, resistance: 220, releaseRatio: 0.75 },
  longPress: { delay: 450, slop: 10 },
  menuTrigger: { holdDelay: 200, slop: 10 },
  menuDrag: { slop: 10 },
  swipeBack: { edge: 24, slop: 10, ratio: 1.4, commit: 0.35, velocity: 450, minTravel: 24 },
} as const;

export const zoomMotion = {
  underScale: 0.94,
  dragScale: 0.16,
  dragFollow: 0.55,
  radius: 36,
  fallbackRadius: 24,
  maxSource: { width: 0.8, height: 0.3 },
  open: { response: 0.5, damping: 0.86 },
  close: { response: 0.44, damping: 0.9 },
  cancel: { response: 0.4, damping: 0.82 },
  squareAfter: 0.6,
  fadeIn: 80,
  hold: 32,
  fadeOut: [0.993, 0.999],
  settle: 0.35,
  decodeWait: 120,
  morphSteps: 12,
  relay: { leave: [0, 0.25], arrive: [0.25, 0.65], restyle: [0.1, 0.6] },
} as const;

export type ZoomPhase = { span: readonly [number, number]; always?: boolean };

export const zoomPhases: Record<string, ZoomPhase> = {
  shade: { span: [0.18, 0.55] },
  content: { span: [0.65, 0.95] },
  detail: { span: [0.6, 0.9] },
  chrome: { span: [0.85, 1], always: true },
};

export const toastStack = { maxVisible: 3, peek: 9, gap: 8, estimatedHeight: 64, stackScaleStep: 0.05, stackFadeStep: 0.25 } as const;

export const sheetDetents = { medium: 0.55, large: 1 } as const;
export const menuLayout = { sideOffset: 8, sideOffsetWithPreview: 10, collisionPadding: 12 } as const;

export const exitFallbackMs = { sheet: 950, actionSheet: 700, menu: 1100, alert: 750 } as const;

export const COPIED_MS = 1500;

export const presets = {
  contentAppear: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: springs.smooth,
  },
  barIn: {
    initial: { opacity: 0, y: 90 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 90, transition: springs.dismiss },
    transition: springs.smooth,
  },
  collapse: {
    initial: { opacity: 0, y: -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12, transition: springs.dismiss },
    transition: springs.smooth,
  },
  listInsert: {
    initial: { opacity: 0, scale: 0.96, y: -12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: springs.listInsert,
  },
  listRemove: {
    exit: { opacity: 0, x: "-100%", transition: springs.listRemove },
  },
  cardIn: {
    initial: { opacity: 0, scale: 0.92, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: springs.hero,
  },
  cardOut: {
    exit: { opacity: 0, scale: 0.9, transition: springs.dismiss },
  },
  pillIn: {
    initial: { opacity: 0, y: -12, scale: 0.9 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -12, scale: 0.9, transition: springs.dismiss },
    transition: springs.bouncy,
  },
  chip: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8, transition: springs.dismiss },
    transition: springs.snappy,
  },
  iconSwap: {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.6, transition: springs.dismiss },
    transition: springs.bouncy,
  },
  checkmark: {
    initial: { scale: 0 },
    animate: { scale: 1 },
    exit: { scale: 0, transition: springs.dismiss },
    transition: springs.bouncy,
  },
  statusIcon: {
    initial: { scale: 0.3, opacity: 0, rotate: -30 },
    animate: { scale: 1, opacity: 1, rotate: 0 },
    exit: { scale: 0.3, opacity: 0, transition: springs.dismiss },
    transition: springs.bouncy,
  },
  draw: {
    initial: { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: springs.smooth,
  },
} satisfies Record<string, { initial?: object; animate?: object; exit?: object; transition?: Transition }>;

export const heroMotion = {
  pullScale: 1.06,
  compactAfter: 60,
  compactTravel: 24,
  expandTravel: 16,
} as const;

export const toastMotion = {
  enter: { y: -110, scale: 0.9, opacity: 0 },
  exit: (y: number) => ({ y: y - 140, opacity: 0, scale: 0.94, transition: springs.dismiss }),
  bumpScale: 1.035,
} as const;

export const counterTransition = springs.counter;

export const layoutPx = { selectionColumn: 34, keyboardVisible: 80 } as const;

export const menuMorph = {
  open: springs.morph,
  close: springs.settle,
  contentDelay: stagger.base,
  maxStartScale: 0.9,
} as const;

export const contextMenu = {
  itemHeight: 44,
  sectionGap: 8 + 12,
  panelPadding: 12,
  gap: menuLayout.sideOffsetWithPreview,
  edge: 12,
  lift: springs.present,
  settle: springs.settle,
  handoff: fade,
} as const;
