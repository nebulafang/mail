import { DAY_MS, HOUR_MS } from "./time";

export const EXPIRY_OPTIONS = {
  "1h": { label: "1 小时", ms: HOUR_MS },
  "1d": { label: "1 天", ms: DAY_MS },
  "7d": { label: "7 天", ms: 7 * DAY_MS },
} as const;

export type Expiry = keyof typeof EXPIRY_OPTIONS;
export const EXPIRY_KEYS = Object.keys(EXPIRY_OPTIONS) as [Expiry, ...Expiry[]];

export const MAX_SAVED_MAILBOXES = 10;

export const MAX_ACCOUNT_MAILBOXES = 50;

export const MAX_MESSAGES_PER_MAILBOX = 1000;

export const MAILBOX_COUNT_CAP = 100;

export const CATCH_ALL_TTL_MS = 7 * DAY_MS;

export const MAX_EMAIL_SIZE = 10 * 1024 * 1024;
export const MAX_BODY_CHARS = 300_000;

export const PERMANENT_AT = 253402300799000;

export type ExpiryUpdate = Expiry | "permanent";

export const isPermanent = (expiresAt: string | number | Date | null | undefined) =>
  !!expiresAt && new Date(expiresAt).getTime() >= PERMANENT_AT;

export function expiryToDate(expiry: ExpiryUpdate, now = Date.now()) {
  return new Date(expiry === "permanent" ? PERMANENT_AT : now + EXPIRY_OPTIONS[expiry].ms);
}

export const MAX_NOTE_LENGTH = 40;

export function parseDomains(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export const contactEmail = () => process.env.CONTACT_EMAIL?.trim() || undefined;
