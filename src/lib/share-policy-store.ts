import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { appSetting } from "../db/schema";
import { readSharePolicy, SHARE_POLICY_KEY } from "./share-policy";

export const sharePolicyQuery = (db: DB) =>
  db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, SHARE_POLICY_KEY)).limit(1);

export const toSharePolicy = (rows: { value: unknown }[]) => readSharePolicy(rows[0]?.value);

export async function loadSharePolicy(db: DB) {
  return toSharePolicy(await sharePolicyQuery(db));
}
