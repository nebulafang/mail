import { describe, expect, it } from "vitest";
import { contextMenu, menuLayout } from "@/design-system/motion";
import {
  createItemClickGate,
  estimateMenuHeight,
  isScrollable,
  menuPlacement,
  spaceBeside,
  triggerPress,
  visibleBounds,
  watchPointerRelease,
} from "@/presentation/menu-layout";
import type { MenuPointer, MenuSection } from "@/presentation/store";

const phone = { x: 0, y: 0, width: 360, height: 640 };
const { sideOffset: gap, collisionPadding: padding } = menuLayout;

const memberMenu: MenuSection[] = [
  { title: "权限", items: [{ id: "a", label: "只读" }, { id: "b", label: "可整理" }, { id: "c", label: "可管理" }] },
  {
    title: "有效期（从现在开始计算）",
    items: [{ id: "d", label: "跟随邮箱" }, { id: "e", label: "1 天后到期" }, { id: "f", label: "7 天后到期" }, { id: "g", label: "30 天后到期" }],
  },
  { items: [{ id: "h", label: "移除成员" }] },
];

const shortMenu: MenuSection[] = [{ items: [{ id: "a", label: "退出管理员" }] }];

const anchorAt = (top: number, height = 32) => ({ top, bottom: top + height });

function pointerEvent(type: string, pointerId: number, pointerType = "touch") {
  return Object.assign(new Event(type), { pointerId, pointerType });
}

function touchEvent(type: string, remaining: number) {
  return Object.assign(new Event(type), { touches: { length: remaining } });
}

describe("可视区域", () => {
  it("扣除安全区和键盘后得到真正可见的范围", () => {
    const keyboardOpen = { x: 0, y: 0, width: 360, height: 340 };
    expect(visibleBounds(keyboardOpen, { top: 24, right: 0, bottom: 0, left: 0 })).toEqual({ x: 0, y: 24, width: 360, height: 316 });
    expect(visibleBounds({ x: 0, y: 120, width: 360, height: 500 })).toEqual({ x: 0, y: 120, width: 360, height: 500 });
    expect(visibleBounds({ x: 0, y: 0, width: 10, height: 10 }, { top: 20, right: 20, bottom: 20, left: 20 })).toMatchObject({ width: 0, height: 0 });
  });
});

describe("菜单摆放", () => {
  it("成员菜单在 360×640 竖屏下，按钮在中部时两侧都放不下，改为覆盖按钮并占用整屏高度", () => {
    const height = estimateMenuHeight(memberMenu, contextMenu);
    expect(height).toBeGreaterThan(400);
    for (const top of [200, 300, 400]) {
      expect(menuPlacement(anchorAt(top), visibleBounds(phone), height, gap, padding)).toBe("overlap");
    }
    expect(menuPlacement(anchorAt(80), visibleBounds(phone), height, gap, padding)).toBe("beside");
    expect(menuPlacement(anchorAt(560), visibleBounds(phone), height, gap, padding)).toBe("beside");
  });

  it("短菜单照旧贴着按钮弹出", () => {
    const height = estimateMenuHeight(shortMenu, contextMenu);
    expect(menuPlacement(anchorAt(560), visibleBounds(phone), height, gap, padding)).toBe("beside");
    expect(menuPlacement(anchorAt(40), visibleBounds(phone), height, gap, padding)).toBe("beside");
  });

  it("软键盘弹出后可见高度变小，原本放得下的菜单也会改为覆盖", () => {
    const sections: MenuSection[] = [{ items: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) })) }];
    const height = estimateMenuHeight(sections, contextMenu);
    expect(menuPlacement(anchorAt(200), visibleBounds(phone), height, gap, padding)).toBe("beside");
    const withKeyboard = visibleBounds({ x: 0, y: 0, width: 360, height: 330 });
    expect(menuPlacement(anchorAt(200), withKeyboard, height, gap, padding)).toBe("overlap");
  });

  it("横屏和系统字体放大时按放大后的高度判断", () => {
    const landscape = visibleBounds({ x: 0, y: 0, width: 740, height: 360 });
    const sections: MenuSection[] = [{ items: [1, 2, 3].map((n) => ({ id: String(n), label: String(n) })) }];
    const normal = estimateMenuHeight(sections, contextMenu);
    const enlarged = estimateMenuHeight(sections, contextMenu, 1.5);
    expect(enlarged).toBeGreaterThan(normal * 1.4);
    expect(menuPlacement(anchorAt(20), landscape, normal, gap, padding)).toBe("beside");
    expect(menuPlacement(anchorAt(160), landscape, enlarged, gap, padding)).toBe("overlap");
  });

  it("可用空间按可视区域计算，而不是整个页面", () => {
    const scrolledViewport = visibleBounds({ x: 0, y: 200, width: 360, height: 400 });
    expect(spaceBeside(anchorAt(250), scrolledViewport, gap, padding)).toEqual({ above: 250 - gap - 212, below: 588 - 282 - gap });
  });

  it("判断内容是否需要滚动", () => {
    expect(isScrollable({ scrollHeight: 463, clientHeight: 283 })).toBe(true);
    expect(isScrollable({ scrollHeight: 283.5, clientHeight: 283 })).toBe(false);
  });
});

describe("按下即弹出的菜单", () => {
  it("手指在菜单出现前就抬起时会被记录，避免之后的滑动被当成拖选", () => {
    const target = new EventTarget();
    const pointer: MenuPointer = { id: 7, x: 0, y: 0 };
    watchPointerRelease(pointer, target, false);
    target.dispatchEvent(pointerEvent("pointerup", 8));
    expect(pointer.released).toBeUndefined();
    target.dispatchEvent(pointerEvent("pointerup", 7));
    expect(pointer.released).toBe(true);
  });

  it("触屏的 pointercancel 不算抬起，最后一根手指离开才算", () => {
    const target = new EventTarget();
    const pointer: MenuPointer = { id: 3, x: 0, y: 0 };
    watchPointerRelease(pointer, target, false);
    target.dispatchEvent(pointerEvent("pointercancel", 3, "touch"));
    target.dispatchEvent(touchEvent("touchend", 1));
    expect(pointer.released).toBeUndefined();
    target.dispatchEvent(touchEvent("touchend", 0));
    expect(pointer.released).toBe(true);
  });

  it("鼠标的 pointercancel 视为结束，并且只监听一次", () => {
    const target = new EventTarget();
    const pointer: MenuPointer = { id: 1, x: 0, y: 0 };
    watchPointerRelease(pointer, target, false);
    target.dispatchEvent(pointerEvent("pointercancel", 1, "mouse"));
    expect(pointer.released).toBe(true);
    pointer.released = false;
    target.dispatchEvent(pointerEvent("pointerup", 1));
    expect(pointer.released).toBe(false);
  });
});

describe("单击 ⋯ 不会误触菜单项", () => {
  it("只有鼠标按下即弹出，触屏和触控笔要抬手单击或按住才弹出", () => {
    expect(triggerPress("mouse")).toBe("immediate");
    expect(triggerPress("touch")).toBe("hold");
    expect(triggerPress("pen")).toBe("hold");
    expect(triggerPress("")).toBe("hold");
  });

  it("打开菜单的那一下点击落到菜单项上时被拦下", () => {
    const gate = createItemClickGate();
    expect(gate.allows(1)).toBe(false);
  });

  it("在菜单里重新按下后，点击菜单项才生效", () => {
    const gate = createItemClickGate();
    gate.press();
    expect(gate.allows(1)).toBe(true);
  });

  it("键盘触发的点击不受影响", () => {
    expect(createItemClickGate().allows(0)).toBe(true);
  });

  it("成员菜单在手机上放不下时会盖住 ⋯ 按钮，高屏时放在旁边", () => {
    const tall = { x: 0, y: 0, width: 360, height: 900 };
    const height = estimateMenuHeight(memberMenu, contextMenu);
    expect(menuPlacement(anchorAt(100), tall, height, gap, padding)).toBe("beside");
    expect(menuPlacement(anchorAt(300), phone, height, gap, padding)).toBe("overlap");
  });
});
