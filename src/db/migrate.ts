import { migrationNames } from "./migration-names.gen";

const TABLE = `CREATE TABLE IF NOT EXISTS d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

let ready: Promise<void> | null = null;

export function ensureSchema(d1: D1Database) {
  ready ??= migrate(d1).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

async function appliedMigrations(d1: D1Database) {
  try {
    return (await d1.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results;
  } catch {
    await d1.prepare(TABLE).run();
    return [];
  }
}

async function latestApplied(d1: D1Database) {
  const latest = migrationNames.at(-1);
  if (!latest) return true;
  try {
    return !!(await d1.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(latest).first());
  } catch {
    return false;
  }
}

async function migrate(d1: D1Database) {
  if (await latestApplied(d1)) return;
  const applied = new Set((await appliedMigrations(d1)).map((r) => r.name));
  if (migrationNames.every((name) => applied.has(name))) return;
  const { migrations } = await import("./migrations.gen");
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    try {
      await d1.batch([
        ...m.statements.map((s) => d1.prepare(s)),
        d1.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name),
      ]);
      console.log(`已自动执行数据库迁移 ${m.name}`);
    } catch (err) {
      const done = await d1.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(m.name).first();
      if (!done) throw err;
    }
  }
}
