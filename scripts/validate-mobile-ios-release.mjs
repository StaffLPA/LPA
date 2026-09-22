import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runReleaseCommand(standaloneDir, command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: standaloneDir,
    stdio: "inherit",
    env: { ...process.env, CI: "1", NODE_ENV: "production" },
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}.`);
  }
}

export function validateMobileIosRelease({
  mobileDir = path.join(root, "artifacts", "lpa-hub"),
  actualNode = process.versions.node,
  runCommand = runReleaseCommand,
  resolveImport,
  guardOnly = false,
} = {}) {
  const packageJson = JSON.parse(
    readFileSync(path.join(mobileDir, "package.json"), "utf8"),
  );
  const easJson = JSON.parse(
    readFileSync(path.join(mobileDir, "eas.json"), "utf8"),
  );
  const expectedNode = easJson.build?.production?.node;

  if (!expectedNode || !expectedNode.startsWith("22.")) {
    throw new Error(
      `eas.json must pin the SDK 57 production build to Node 22 (found ${expectedNode ?? "no version"}).`,
    );
  }

  if (actualNode.split(".")[0] !== expectedNode.split(".")[0]) {
    throw new Error(
      `Run this validation with Node ${expectedNode.split(".")[0]}; currently running Node ${actualNode}.`,
    );
  }

  const directDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const babelConfigSource = readFileSync(
    path.join(mobileDir, "babel.config.js"),
    "utf8",
  );
  const babelImports = [
    ...babelConfigSource.matchAll(
      /(?:require(?:\.resolve)?\(\s*|from\s+|presets?\s*:\s*\[\s*\[?\s*)['"]([^.'"@/][^'"]*|@[^/'"]+\/[^/'"]+)['"]/g,
    ),
  ].map((match) => match[1]);

  for (const importedName of new Set(babelImports)) {
    const packageName = importedName.startsWith("@")
      ? importedName.split("/").slice(0, 2).join("/")
      : importedName.split("/")[0];
    if (!directDependencies[packageName]) {
      throw new Error(
        `Babel configuration imports "${packageName}", but it is not a direct mobile dependency.`,
      );
    }
  }

  const tempRoot = mkdtempSync(path.join(tmpdir(), "lpa-ios-release-"));
  const standaloneDir = path.join(tempRoot, "lpa-hub");

  try {
    cpSync(mobileDir, standaloneDir, {
      recursive: true,
      filter(source) {
        const relative = path.relative(mobileDir, source);
        return !(
          relative === "node_modules" ||
          relative.startsWith(`node_modules${path.sep}`) ||
          relative === ".expo" ||
          relative.startsWith(`.expo${path.sep}`)
        );
      },
    });

    for (const requiredFile of [
      "package.json",
      "pnpm-lock.yaml",
      "babel.config.js",
      "vendor/workspace-api-client-react-0.0.2.tgz",
    ]) {
      if (!existsSync(path.join(standaloneDir, requiredFile))) {
        throw new Error(`Standalone release copy is missing ${requiredFile}.`);
      }
    }

    runCommand(standaloneDir, "corepack", [
      "pnpm",
      "install",
      "--ignore-workspace",
      "--frozen-lockfile",
      "--ignore-scripts",
    ]);

    const standaloneRequire = resolveImport
      ? null
      : createRequire(path.join(standaloneDir, "package.json"));
    for (const importedName of new Set(babelImports)) {
      try {
        if (resolveImport) resolveImport(importedName, standaloneDir);
        else standaloneRequire.resolve(importedName);
      } catch {
        throw new Error(
          `Babel import "${importedName}" cannot be resolved from the standalone mobile artifact.`,
        );
      }
    }

    runCommand(standaloneDir, "corepack", [
      "pnpm",
      "exec",
      "expo",
      "install",
      "--check",
    ]);

    if (guardOnly) return;

    const outputDir = path.join(tempRoot, "ios-export");
    runCommand(standaloneDir, "corepack", [
      "pnpm",
      "exec",
      "expo",
      "export:embed",
      "--platform",
      "ios",
      "--dev",
      "false",
      "--minify",
      "--bundle-output",
      path.join(outputDir, "main.jsbundle"),
      "--assets-dest",
      path.join(outputDir, "assets"),
    ]);

    console.log(
      `\nStandalone iOS release validation passed on Node ${actualNode} (production pin: ${expectedNode}).`,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    validateMobileIosRelease();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
