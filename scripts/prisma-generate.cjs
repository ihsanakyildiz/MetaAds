const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { applyDatabaseUrl } = require("./resolve-database-url.cjs");

applyDatabaseUrl();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "mysql://127.0.0.1:3306/metaads";
}

const prismaCli = path.join(__dirname, "..", "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: path.join(__dirname, ".."),
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
