---
name: Expo cloud workspace packaging
description: Why the LPA mobile artifact carries its own pnpm lockfile and generated API client package.
---

LPA's external Expo build can install only the mobile artifact rather than the repository root. Treat the mobile folder as an independently installable package: it must include a frozen pnpm lockfile and a packaged version of its generated API client.

**Why:** The root pnpm workspace lockfile and `workspace:*` dependency are unavailable in that isolated checkout, causing the cloud build to fail before native compilation.

**How to apply:** When the API client is regenerated, use the project code-generation command so it refreshes the mobile client archive and isolated lockfile together. Do not remove the mobile lockfile or replace the packaged client with an out-of-folder workspace reference.

Expo's Git-based build integration can still run pnpm from the repository root even when the mobile artifact is selected as the project directory. Keep the root and mobile manifests aligned with their lockfiles. The `packageManager` field alone does not control this builder; the EAS profile must enable Corepack and explicitly select a compatible pnpm version.

**Why:** A successful local isolated install is not sufficient when the cloud builder sees a different manifest or an older pnpm binary; it can ignore a valid lockfile and fail with `ERR_PNPM_NO_LOCKFILE`.

**How to apply:** Before triggering a Git-based build, verify the remote repository contains the mobile manifest, mobile lockfile, packaged API-client archive, and root lockfile. Run a standalone frozen install from a copy of the mobile artifact, and ensure the production App Bundle profile enables Corepack and pins the pnpm version used to create the lockfile.

**Registry timing edge case:** If the code-generation command rebuilds the archive but its isolated lockfile refresh is blocked by the package registry's release-age policy, the regenerated archive still needs matching integrity entries in both the root and mobile frozen lockfiles.

**Why:** A changed local tarball with stale integrity metadata causes frozen isolated Expo installs to fail before the build starts.

**How to apply:** Prefer a normal code-generation run. When its lockfile-only phase is blocked by an unrelated timing-gated transitive package, verify the archive's SHA-512 integrity and update only the corresponding local-tarball integrity entries; do not change dependency versions merely to refresh the checksum.