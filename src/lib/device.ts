const VENDORS: [RegExp, string][] = [
  [/^(SM-|Galaxy)/i, "三星"],
  [/^(M2\d|2\d{3}[A-Z0-9]{4,}|Redmi|MI |POCO|Xiaomi)/i, "小米"],
  [/^(HUAWEI|HONOR|[A-Z]{3}-(AL|TL|AN|LX)\d{2})/i, "华为/荣耀"],
  [/^(PH[A-Z]\d{3}|CPH\d{4}|OPPO|PE[A-Z]{2}\d{2}|RMX\d{4})/i, "OPPO/realme"],
  [/^(V2\d{3}|vivo|I\d{4})/i, "vivo"],
  [/^Pixel/i, "Google"],
  [/^(PJ[A-Z]\d{3}|NE\d{4}|OnePlus|LE\d{4})/i, "一加"],
];

const MAX_MODEL = 80;

function baseModel(ua: string, hint: string) {
  const android = ua.match(/Android [\d.]+(?:;\s*([^;)]+))?/);
  if (android) {
    const uaModel = android[1]?.replace(/\s*Build\/.*$/, "").trim();
    return { name: hint || (uaModel && uaModel !== "K" ? uaModel : "") || "Android 设备", mobile: true };
  }
  if (/iPhone/.test(ua)) return { name: "iPhone", mobile: true };
  if (/iPad/.test(ua)) return { name: "iPad", mobile: true };
  if (/Windows NT/.test(ua)) return { name: "Windows 电脑", mobile: false };
  if (/Macintosh|Mac OS X/.test(ua)) return { name: "Mac", mobile: false };
  if (/CrOS/.test(ua)) return { name: "Chromebook", mobile: false };
  if (/Linux/.test(ua)) return { name: "Linux 电脑", mobile: false };
  return null;
}

export function deviceModel(ua: string | null, modelHint: string | null) {
  const hint = modelHint?.replace(/^"|"$/g, "").trim() ?? "";
  const base = baseModel(ua ?? "", hint);
  if (!base) return null;
  const vendor = base.mobile ? VENDORS.find(([re]) => re.test(base.name))?.[1] : undefined;
  return (vendor ? `${vendor} ${base.name}` : base.name).slice(0, MAX_MODEL);
}
