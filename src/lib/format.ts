import { isPermanent, MAILBOX_COUNT_CAP } from "./config";

export const formatCount = (n: number) => n.toLocaleString("zh-CN");

export const formatCapped = (n: number) => (n >= MAILBOX_COUNT_CAP ? `${MAILBOX_COUNT_CAP - 1}+` : String(n));

export const pad2 = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatListTime(value: string | Date) {
  const d = new Date(value);
  const now = new Date();
  if (sameDay(d, now)) return hm(d);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return "昨天";
  return d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatFullTime(value: string | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm(d)}`;
}

function humanizeDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const min = Math.round(s / 60);
  const h = Math.round(min / 60);
  const day = Math.round(h / 24);
  if (s < 45) return "几秒";
  if (min < 45) return min <= 1 ? "1 分钟" : `${min} 分钟`;
  if (h < 22) return h <= 1 ? "1 小时" : `${h} 小时`;
  if (day < 26) return day <= 1 ? "1 天" : `${day} 天`;
  if (day < 320) return `${Math.max(1, Math.round(day / 30))} 个月`;
  return `${Math.max(1, Math.round(day / 365))} 年`;
}

const FRESH_CODE_MS = 30 * 60 * 1000;

export const isFreshCode = (receivedAt: string | Date) => Date.now() - new Date(receivedAt).getTime() < FRESH_CODE_MS;

export function formatRemaining(expiresAt: string | Date | null) {
  if (!expiresAt || isPermanent(expiresAt)) return "永久有效";
  const left = new Date(expiresAt).getTime() - Date.now();
  return left <= 0 ? "已过期" : `剩余 ${humanizeDuration(left)}`;
}

const weekdayFormat = new Intl.DateTimeFormat("zh-CN", { weekday: "narrow" });

export function formatWeekday(value: string | Date) {
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00`) : new Date(value);
  return weekdayFormat.format(d);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelative(value: string | Date) {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return "刚刚";
  return `${humanizeDuration(ms)}前`;
}
