import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { appSetting } from "../db/schema";

export const REGISTRATION_KEY = "registration_open";

export const registrationQuery = (db: DB) =>
  db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, REGISTRATION_KEY)).limit(1);

export const toRegistrationOpen = (rows: { value: unknown }[]) => rows[0]?.value !== false;

export async function loadRegistrationOpen(db: DB) {
  return toRegistrationOpen(await registrationQuery(db));
}

export const saveRegistrationOpen = (db: DB, open: boolean, now = new Date()) =>
  db
    .insert(appSetting)
    .values({ key: REGISTRATION_KEY, value: open, updatedAt: now })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: open, updatedAt: now } });
