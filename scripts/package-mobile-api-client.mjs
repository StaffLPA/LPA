import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "lib", "api-client-react");
const mobileDir = path.join(root, "artifacts", "lpa-hub");
const vendorDir = path.join(mobileDir, "vendor");

mkdirSync(vendorDir, { recursive: true });
rmSync(path.join(vendorDir, "workspace-api-client-react-0.0.0.tgz"), { force: true });

execFileSync(
  "pnpm",
  ["pack", "--pack-destination", vendorDir],
  { cwd: clientDir, stdio: "inherit" },
);

execFileSync(
  "pnpm",
  ["install", "--ignore-workspace", "--lockfile-only", "--no-frozen-lockfile", "--ignore-scripts"],
  { cwd: mobileDir, stdio: "inherit" },
);