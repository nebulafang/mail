import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type DB = ReturnType<typeof createDb>;

const instances = new WeakMap<D1Database, DB>();

export function getDb(d1: D1Database) {
  let db = instances.get(d1);
  if (!db) instances.set(d1, (db = createDb(d1)));
  return db;
}
