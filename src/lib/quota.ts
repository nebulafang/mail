import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { appSetting } from "../db/schema";
import { MAX_BODY_CHARS } from "./config";

export const STORAGE_PRESSURE_KEY = "storage_pressure";

export type StoragePressure = "normal" | "soft" | "hard";

const MB = 1024 * 1024;

export const QUOTA_DEFAULTS = {
  softLimitMb: 400,
  hardLimitMb: 470,
} as const;

type QuotaVars = {
  STORAGE_SOFT_LIMIT_MB?: string;
  STORAGE_HARD_LIMIT_MB?: string;
};

function nonNegative(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function quotaLimits(env: CloudflareEnv) {
  const vars = env as unknown as QuotaVars;
  return {
    softBytes: nonNegative(vars.STORAGE_SOFT_LIMIT_MB, QUOTA_DEFAULTS.softLimitMb) * MB,
    hardBytes: nonNegative(vars.STORAGE_HARD_LIMIT_MB, QUOTA_DEFAULTS.hardLimitMb) * MB,
  };
}

export type QuotaLimits = ReturnType<typeof quotaLimits>;

export function pressureOf(sizeBytes: number, limits: Pick<QuotaLimits, "softBytes" | "hardBytes">): StoragePressure {
  if (!sizeBytes) return "normal";
  if (sizeBytes >= limits.hardBytes) return "hard";
  if (sizeBytes >= limits.softBytes) return "soft";
  return "normal";
}

export const INGEST_POLICY = {
  normal: { bodyChars: MAX_BODY_CHARS, keepHtml: true },
  soft: { bodyChars: 50_000, keepHtml: true },
  hard: { bodyChars: 20_000, keepHtml: false },
} as const satisfies Record<StoragePressure, { bodyChars: number; keepHtml: boolean }>;

export const storagePressureQuery = (db: DB) =>
  db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, STORAGE_PRESSURE_KEY)).limit(1);

export type StorageState = { level: StoragePressure; size: number; mark: number; freed: number };

const EMPTY_STATE: StorageState = { level: "normal", size: 0, mark: 0, freed: 0 };

const finite = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

export function readStorageState(rows: { value: unknown }[]): StorageState {
  const value = rows[0]?.value as Partial<Record<keyof StorageState, unknown>> | undefined;
  if (!value) return EMPTY_STATE;
  const level = value.level === "soft" || value.level === "hard" ? value.level : "normal";
  return { level, size: finite(value.size), mark: finite(value.mark), freed: finite(value.freed) };
}

export const readStoragePressure = (rows: { value: unknown }[]) => readStorageState(rows).level;

export async function loadStorageState(db: DB) {
  try {
    return readStorageState(await storagePressureQuery(db));
  } catch {
    return EMPTY_STATE;
  }
}

export const loadStoragePressure = async (db: DB) => (await loadStorageState(db)).level;

export async function databaseSize(d1: D1Database) {
  const { meta } = await d1.prepare("select 1").run();
  return Number(meta.size_after) || 0;
}

export function measureStorage(previous: StorageState, size: number) {
  const baseline = size === previous.mark ? previous : { ...previous, mark: size, freed: 0 };
  return { mark: baseline.mark, freed: baseline.freed, used: Math.max(0, size - baseline.freed) };
}

export function reclaimNeed(used: number, limits: Pick<QuotaLimits, "softBytes" | "hardBytes">) {
  return used && used >= limits.hardBytes ? used - limits.softBytes : 0;
}

export type Reclaimer = (needBytes: number) => Promise<number>;

export async function manageStorage(env: CloudflareEnv, db: DB, reclaim: Reclaimer, now = new Date()) {
  const limits = quotaLimits(env);
  const size = await databaseSize(env.DB);
  const previous = await loadStorageState(db);
  const measured = measureStorage(previous, size);
  const need = reclaimNeed(measured.used, limits);
  const freed = need ? await reclaim(need).catch(() => 0) : 0;
  const used = Math.max(0, measured.used - freed);
  const next: StorageState = { level: pressureOf(used, limits), size, mark: measured.mark, freed: measured.freed + freed };
  if (next.level !== previous.level || next.size !== previous.size || next.mark !== previous.mark || next.freed !== previous.freed) {
    await db
      .insert(appSetting)
      .values({ key: STORAGE_PRESSURE_KEY, value: next, updatedAt: now })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: next, updatedAt: now } })
      .catch((err) => console.warn("保存存储水位失败", err));
  }
  return { ...next, need };
}
