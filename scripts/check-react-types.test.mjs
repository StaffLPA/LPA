import { readFileSync } from "node:fs";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const checker = resolve(root, "scripts/check-react-types.mjs");

function runChecker(...args) {
  const result = spawnSync(process.execPath, [checker, ...args], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function runCheckerWithoutProjectFiles(...args) {
  const isolatedRoot = mkdtempSync(join(tmpdir(), "check-react-types-"));
  const isolatedScripts = resolve(isolatedRoot, "scripts");
  const isolatedChecker = resolve(isolatedScripts, "check-react-types.mjs");
  mkdirSync(isolatedScripts);
  copyFileSync(checker, isolatedChecker);

  try {
    assert.equal(existsSync(resolve(isolatedRoot, "pnpm-workspace.yaml")), false);
    assert.equal(
      existsSync(resolve(isolatedRoot, "artifacts/lpa-hub/package.json")),
      false,
    );
    assert.equal(
      existsSync(resolve(isolatedRoot, "artifacts/mockup-sandbox/package.json")),
      false,
    );

    const result = spawnSync(process.execPath, [isolatedChecker, ...args], {
      cwd: isolatedRoot,
      encoding: "utf8",
    });

    assert.equal(result.error, undefined, result.error?.message);
    return result;
  } finally {
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

test("prints supported commands and candidate formats on request", () => {
  const result = runChecker("--help");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Supported commands:/);
  assert.match(
    result.stdout,
    /Candidate values are @types\/react and @types\/react-dom specifiers/,
  );
  assert.doesNotMatch(result.stdout, /compatibility check (passed|failed)/i);
});

test("prints help successfully without workspace or artifact dependency files", () => {
  const result = runCheckerWithoutProjectFiles("--help");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Supported commands:/);
  assert.match(
    result.stdout,
    /Candidate values are @types\/react and @types\/react-dom specifiers/,
  );
  assert.doesNotMatch(result.stdout, /compatibility check (passed|failed)/i);
});

test("reports invalid options without workspace or artifact dependency files", () => {
  const value = "--typo";
  const result = runCheckerWithoutProjectFiles(value);

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`Unrecognized option "${value}"\\.`));
  assert.match(result.stderr, /Supported commands:/);
  assert.match(
    result.stderr,
    /Candidate values are @types\/react and @types\/react-dom specifiers/,
  );
  assert.doesNotMatch(result.stderr, /ENOENT|pnpm-workspace\.yaml/);
});

test("derives candidates from the mobile manifest and shared web catalog", () => {
  const mobilePackage = JSON.parse(
    readFileSync(resolve(root, "artifacts/lpa-hub/package.json"), "utf8"),
  );
  const webPackage = JSON.parse(
    readFileSync(resolve(root, "artifacts/mockup-sandbox/package.json"), "utf8"),
  );
  const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");
  const result = runChecker("--candidate-from-manifests");

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    mobilePackage.devDependencies["@types/react"],
    /^~19\.1\.\d+$/,
  );
  assert.match(
    mobilePackage.devDependencies["@types/react-dom"],
    /^~19\.1\.\d+$/,
  );
  assert.equal(webPackage.devDependencies["@types/react"], "catalog:");
  assert.equal(webPackage.devDependencies["@types/react-dom"], "catalog:");
  assert.match(workspace, /^\s+'?@types\/react'?:\s+\^19\.2(?:\.\d+)?/m);
  assert.match(
    workspace,
    /^\s+'?@types\/react-dom'?:\s+\^19\.2(?:\.\d+)?/m,
  );
  assert.match(result.stdout, /passed for 2 candidate upgrades/);
  assert.match(
    result.stdout,
    /mobile supports React 19\.1 types and web supports React 19\.2 types/,
  );
});

test("reports each affected artifact and remediation for mismatched type lines", () => {
  const result = runChecker(
    "--candidate",
    "mobile=19.1.10,19.2.0",
    "--candidate",
    "web=19.2.0,19.1.0",
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /React type compatibility check failed/);
  assert.match(
    result.stderr,
    /mobile artifact \(@workspace\/lpa-hub\) \(candidate upgrade\): @types\/react .* and @types\/react-dom .* use different React type lines .*; align the dependency pair\./,
  );
  assert.match(
    result.stderr,
    /web artifact \(@workspace\/mockup-sandbox\) \(candidate upgrade\): @types\/react .* and @types\/react-dom .* use different React type lines .*; align the dependency pair\./,
  );
});

test("rejects conflicting manifest and explicit candidate modes", () => {
  const result = runChecker(
    "--candidate-from-manifests",
    "--candidate",
    "mobile=19.1.10,19.1.7",
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /--candidate-from-manifests cannot be combined with explicit --candidate values/,
  );
});

test("reports the required format when --candidate has no value", () => {
  const result = runChecker("--candidate");

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Each --candidate must be followed by id=react,react-dom\./,
  );
});

test("reports the malformed candidate value and accepted format", () => {
  const value = "mobile=19.1.10";
  const result = runChecker("--candidate", value);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(
      `Invalid candidate "${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}". Use id=react-specifier,react-dom-specifier\\.`,
    ),
  );
});

test("reports unrecognized options and supported commands", () => {
  const value = "--typo";
  const result = runChecker(value);

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`Unrecognized option "${value}"\\.`));
  assert.match(result.stderr, /Supported commands:/);
  assert.match(result.stderr, /Candidate values are @types\/react and @types\/react-dom specifiers/);
});

test("reports duplicate candidates for the affected artifact", () => {
  const result = runChecker(
    "--candidate",
    "mobile=19.1.10,19.1.7",
    "--candidate",
    "mobile=19.1.11,19.1.8",
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Candidate for mobile was provided more than once\./,
  );
});

test("reports unknown candidates and accepted artifact choices", () => {
  const value = "tablet=19.1.10,19.1.7";
  const result = runChecker("--candidate", value);

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    new RegExp(
      `Unknown artifact "tablet"\\. Use mobile or web\\.`,
    ),
  );
});
