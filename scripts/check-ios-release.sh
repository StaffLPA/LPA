#!/bin/sh
set -eu

runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/lpa-ios-release-runtime.XXXXXX")"
trap 'rm -rf "$runtime_dir"' EXIT HUP INT TERM

mkdir -p \
  "$runtime_dir/home" \
  "$runtime_dir/data" \
  "$runtime_dir/cache" \
  "$runtime_dir/config" \
  "$runtime_dir/corepack" \
  "$runtime_dir/pnpm"

export HOME="$runtime_dir/home"
export XDG_DATA_HOME="$runtime_dir/data"
export XDG_CACHE_HOME="$runtime_dir/cache"
export XDG_CONFIG_HOME="$runtime_dir/config"
export COREPACK_HOME="$runtime_dir/corepack"
export PNPM_HOME="$runtime_dir/pnpm"

nix-shell -p nodejs_22 --run 'node scripts/validate-mobile-ios-release.mjs'