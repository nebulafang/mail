import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const files = readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort();

const migrations = files.map((name) => ({
  name,
  statements: readFileSync(`drizzle/${name}`, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean),
}));

const out = `// 由 scripts/bundle-migrations.mjs 生成，不要手动修改
export const migrations: { name: string; statements: string[] }[] = ${JSON.stringify(migrations, null, 2)};
`;

writeFileSync("src/db/migrations.gen.ts", out);

const names = `// 由 scripts/bundle-migrations.mjs 生成，不要手动修改
export const migrationNames: string[] = ${JSON.stringify(files)};
`;
writeFileSync("src/db/migration-names.gen.ts", names);
console.log(`bundled ${migrations.length} migrations`);
