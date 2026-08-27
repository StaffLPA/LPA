#!/bin/bash
set -euo pipefail

# Most merges can use the lockfile exactly as committed. Some mobile changes
# replace the locally packed API-client archive; in that case pnpm must refresh
# the archive checksum before dependencies can be restored.
if ! pnpm install --frozen-lockfile; then
  pnpm store prune
  pnpm install --no-frozen-lockfile
fi

pnpm --filter db push
