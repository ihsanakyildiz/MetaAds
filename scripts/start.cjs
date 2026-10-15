const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { applyDatabaseUrl } = require("./resolve-database-url.cjs");

applyDatabaseUrl();

const root = path.join(__dirname, "..");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const shouldPush =
  Boolean(process.env.DB_HOST) && process.env.SKIP_DB_PUSH !== "1";

if (shouldPush && fs.existsSync(prismaCli)) {
  const pushed = spawnSync(
    process.execPath,
    [prismaCli, "db", "push", "--skip-generate"],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (pushed.status !== 0) {
    console.error("prisma db push atlandı veya başarısız oldu; uygulama yine de başlatılıyor.");
  }
}

const port = process.env.PORT || "3003";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
