import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { validateMobileIosRelease } from "./validate-mobile-ios-release.mjs";

function createFixture({
  node = "22.13.0",
  directBabelPreset = true,
  nativeDependency,
} = {}) {
  const mobileDir = mkdtempSync(path.join(tmpdir(), "ios-release-fixture-"));
  mkdirSync(path.join(mobileDir, "vendor"));
  writeFileSync(
    path.join(mobileDir, "package.json"),
    JSON.stringify({
      dependencies: {
        expo: "~57.0.23",
        ...(nativeDependency
          ? { [nativeDependency.name]: nativeDependency.version }
          : {}),
      },
      devDependencies: directBabelPreset
        ? { "babel-preset-expo": "~57.0.11" }
        : {},
    }),
  );
  writeFileSync(
    path.join(mobileDir, "eas.json"),
    JSON.stringify({ build: { production: { node } } }),
  );
  writeFileSync(
    path.join(mobileDir, "babel.config.js"),
    "module.exports = { presets: ['babel-preset-expo'] };\n",
  );
  writeFileSync(
    path.join(mobileDir, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n",
  );
  writeFileSync(
    path.join(mobileDir, "vendor/workspace-api-client-react-0.0.2.tgz"),
    "fixture",
  );
  return mobileDir;
}

function withFixture(options, callback) {
  const mobileDir = createFixture(options);
  try {
    callback(mobileDir);
  } finally {
    rmSync(mobileDir, { recursive: true, force: true });
  }
}

test("rejects an outdated production Node pin before running commands", () => {
  withFixture({ node: "20.19.0" }, (mobileDir) => {
    let commandCount = 0;
    assert.throws(
      () =>
        validateMobileIosRelease({
          mobileDir,
          actualNode: "22.13.0",
          runCommand() {
            commandCount += 1;
          },
        }),
      /must pin the SDK 57 production build to Node 22/,
    );
    assert.equal(commandCount, 0);
  });
});

test("rejects a Babel preset that is only transitively available", () => {
  withFixture({ directBabelPreset: false }, (mobileDir) => {
    assert.throws(
      () =>
        validateMobileIosRelease({
          mobileDir,
          actualNode: "22.13.0",
          runCommand() {
            assert.fail(
              "commands must not run before direct dependencies pass",
            );
          },
        }),
      /imports "babel-preset-expo", but it is not a direct mobile dependency/,
    );
  });
});

test("rejects an Expo-managed native dependency drift", () => {
  withFixture(
    {
      nativeDependency: {
        name: "expo-device",
        version: "0.0.1",
      },
    },
    (mobileDir) => {
      assert.throws(
        () =>
          validateMobileIosRelease({
            mobileDir,
            actualNode: "22.13.0",
            resolveImport() {},
            guardOnly: true,
            runCommand(standaloneDir, _command, args) {
              if (args.join(" ") === "pnpm exec expo install --check") {
                const manifest = JSON.parse(
                  readFileSync(
                    path.join(standaloneDir, "package.json"),
                    "utf8",
                  ),
                );
                assert.equal(manifest.dependencies["expo-device"], "0.0.1");
                throw new Error(
                  "expo install --check failed with exit code 1.",
                );
              }
            },
          }),
        /expo install --check failed with exit code 1/,
      );
    },
  );
});

test("passing guards use stubs instead of installing or bundling", () => {
  withFixture({}, (mobileDir) => {
    const commands = [];
    validateMobileIosRelease({
      mobileDir,
      actualNode: "22.13.0",
      resolveImport() {},
      guardOnly: true,
      runCommand(_cwd, command, args) {
        commands.push([command, ...args].join(" "));
      },
    });

    assert.deepEqual(commands, [
      "corepack pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts",
      "corepack pnpm exec expo install --check",
    ]);
    assert.equal(
      commands.some((command) => command.includes("export:embed")),
      false,
    );
  });
});
