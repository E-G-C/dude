#!/usr/bin/env bash
# Runs the canonical Clearline validator.

set -euo pipefail

if [ "$#" -ne 0 ]; then
  printf '%s\n' "Usage: bash $(basename "$0")" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'FAIL: Node.js is required to run the Clearline validator.' >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_dir/validate.mjs"
