import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceFile = resolve(root, "pnpm-workspace.yaml");

const supported = [
  {
    id: "mobile",
    name: "mobile artifact (@workspace/lpa-hub)",
    packageFile: "artifacts/lpa-hub/package.json",
    typeLine: "19.1",
  },
  {
    id: "web",
    name: "web artifact (@workspace/mockup-sandbox)",
    packageFile: "artifacts/mockup-sandbox/package.json",
    typeLine: "19.2",
  },
];

function getCatalogVersion(workspace, packageName) {
  const match = workspace.match(
    new RegExp(
      `^  ['"]?${packageName.replace("/", "\\/")}['"]?:\\s*(\\S+)`,
      "m",
    ),
  );
  return match?.[1];
}

function resolveSpecifier(specifier, packageName, workspace) {
  if (specifier === "catalog:") {
    return getCatalogVersion(workspace, packageName);
  }
  return specifier;
}

function getTypeLine(specifier) {
  const match = specifier?.match(/(?:^|[~^<>= ])v?(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function printUsage(output = console.error) {
  output(`Usage:
Supported commands:
  pnpm run check:react-types
  pnpm run check:react-types:upgrade -- --candidate mobile=19.1.10,19.1.7 --candidate web=19.2.18,19.2.4
  node scripts/check-react-types.mjs --candidate-from-manifests

Candidate values are @types/react and @types/react-dom specifiers, in that order.
Use one --candidate per artifact. This mode only checks the proposed values and
does not edit package.json or pnpm-lock.yaml. --candidate-from-manifests derives
the candidate values from the authoritative package manifests.`);
}

function getCandidates(args) {
  const candidates = new Map();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--candidate") {
      throw new Error(`Unrecognized option "${args[index]}".`);
    }
    const value = args[++index];
    if (!value || value === "--candidate") {
      throw new Error(
        "Each --candidate must be followed by id=react,react-dom.",
      );
    }
    if (value.startsWith("-")) {
      throw new Error(`Unrecognized option "${value}".`);
    }

    const separator = value.indexOf("=");
    const comma = value.indexOf(",");
    if (separator < 1 || comma < separator + 1 || comma === value.length - 1) {
      throw new Error(
        `Invalid candidate "${value}". Use id=react-specifier,react-dom-specifier.`,
      );
    }

    const id = value.slice(0, separator);
    const [react, reactDom] = value.slice(separator + 1).split(",", 2);
    if (!supported.some((artifact) => artifact.id === id)) {
      throw new Error(`Unknown artifact "${id}". Use mobile or web.`);
    }
    if (candidates.has(id)) {
      throw new Error(`Candidate for ${id} was provided more than once.`);
    }
    candidates.set(id, { react, reactDom });
  }
  return candidates;
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  printUsage(console.log);
  process.exit(0);
}
const failures = [];
const useManifestCandidates = args.includes("--candidate-from-manifests");
const explicitArgs = args.filter((arg) => arg !== "--candidate-from-manifests");
let candidates;
try {
  if (useManifestCandidates && explicitArgs.length > 0) {
    throw new Error(
      "--candidate-from-manifests cannot be combined with explicit --candidate values.",
    );
  }
  candidates = getCandidates(explicitArgs);
} catch (error) {
  console.error(error.message);
  printUsage();
  process.exit(1);
}

const workspace = await readFile(workspaceFile, "utf8");

for (const artifact of supported) {
  const packageJson = JSON.parse(
    await readFile(resolve(root, artifact.packageFile), "utf8"),
  );
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const installedReactTypeSpecifier = resolveSpecifier(
    dependencies["@types/react"],
    "@types/react",
    workspace,
  );
  const installedReactDomTypeSpecifier = resolveSpecifier(
    dependencies["@types/react-dom"],
    "@types/react-dom",
    workspace,
  );
  if (useManifestCandidates) {
    candidates.set(artifact.id, {
      react: installedReactTypeSpecifier,
      reactDom: installedReactDomTypeSpecifier,
    });
  }
  const pairs = [
    {
      label: "installed dependencies",
      react: installedReactTypeSpecifier,
      reactDom: installedReactDomTypeSpecifier,
    },
  ];
  const candidate = candidates.get(artifact.id);
  if (candidate) pairs.push({ label: "candidate upgrade", ...candidate });

  for (const pair of pairs) {
    const reactTypeLine = getTypeLine(pair.react);
    const reactDomTypeLine = getTypeLine(pair.reactDom);
    const context = `${artifact.name} (${pair.label})`;

    if (!reactTypeLine || !reactDomTypeLine) {
      failures.push(
        `${context}: could not resolve @types/react (${pair.react ?? "missing"}) and @types/react-dom (${pair.reactDom ?? "missing"}); align the dependency pair.`,
      );
      continue;
    }

    if (reactTypeLine !== reactDomTypeLine) {
      failures.push(
        `${context}: @types/react (${pair.react}) and @types/react-dom (${pair.reactDom}) use different React type lines (${reactTypeLine} vs ${reactDomTypeLine}); align the dependency pair.`,
      );
    }

    if (reactTypeLine !== artifact.typeLine) {
      failures.push(
        `${context}: supported type line is React ${artifact.typeLine}; align @types/react (${pair.react}) and @types/react-dom (${pair.reactDom}) with that line.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("React type compatibility check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (candidates.size > 0) {
  console.log(
    `React type compatibility check passed for ${candidates.size} candidate upgrade${candidates.size === 1 ? "" : "s"}: mobile supports React 19.1 types and web supports React 19.2 types.`,
  );
} else {
  console.log(
    "React type compatibility check passed: mobile uses React 19.1 types and web uses React 19.2 types.",
  );
}
