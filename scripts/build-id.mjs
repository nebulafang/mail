import { writeFileSync } from "node:fs";

const id = Date.now().toString(36);
writeFileSync("src/build-id.gen.ts", `// 由 scripts/build-id.mjs 生成，不要手动修改\nexport const BUILD_ID = "${id}";\n`);
console.log(`build id ${id}`);
