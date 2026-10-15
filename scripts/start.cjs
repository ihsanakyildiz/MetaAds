const { spawn } = require("node:child_process");
const path = require("node:path");

const port = process.env.PORT || "3003";
const nextBin = path.join(__dirname, "..", "node_modules", "next", "dist", "bin", "next");

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
