import { describe, expect, it } from "vitest";
import { deviceModel } from "@/lib/device";
import { forwardedIp } from "@/lib/client-ip";

describe("设备型号", () => {
  it("安卓优先用浏览器给出的型号，并补上厂商", () => {
    const ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
    expect(deviceModel(ua, '"2211133C"')).toBe("小米 2211133C");
    expect(deviceModel(ua, null)).toBe("Android 设备");
  });

  it("没有型号提示时从 UA 里取", () => {
    expect(deviceModel("Mozilla/5.0 (Linux; Android 13; SM-S9180 Build/TP1A) Mobile", "")).toBe("三星 SM-S9180");
  });

  it("苹果和电脑只能识别到类别", () => {
    expect(deviceModel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", null)).toBe("iPhone");
    expect(deviceModel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", null)).toBe("Windows 电脑");
    expect(deviceModel(null, null)).toBeNull();
  });
});

describe("登录 IP", () => {
  it("优先取 Cloudflare 给出的 IP", () => {
    expect(forwardedIp(new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" }))).toBe("203.0.113.7");
    expect(forwardedIp(new Headers({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(forwardedIp(new Headers())).toBeNull();
  });
});
