#!/usr/bin/env bash
# Microsoft visual-brand smoke check (internal use only).
#
# Fails when raw Microsoft brand hex codes leak into authored content,
# templates, or SCSS, or when the SCSS token import is missing. This is a
# fast drift guard, not a full brand audit - pair it with the
# `@dude-pack-strata-stylist` agent for visual review.
#
# Usage:  bash .github/skills/dude-pack-strata-visual/scripts/strata-check.sh
# Exit:   0 = clean, 1 = brand drift found.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$repo_root"

# Microsoft four-square + neutral brand hex codes that must come from tokens.
# Matched in hex form and in the rgb()/rgba() functional forms, which are the
# same colours written in a notation a hex-only guard cannot see.
brand_hex='#F25022|#7FBA00|#00A4EF|#FFB900|#737373'
brand_rgb='rgba?\(\s*242\s*,\s*80\s*,\s*34|rgba?\(\s*127\s*,\s*186\s*,\s*0|rgba?\(\s*0\s*,\s*164\s*,\s*239|rgba?\(\s*255\s*,\s*185\s*,\s*0|rgba?\(\s*115\s*,\s*115\s*,\s*115'
brand_any="$brand_hex|$brand_rgb"

# Authored surfaces Hugo renders. The token files themselves are the one
# legitimate home for the raw hex, so they are excluded.
search_globs=(
  'content'
  'layouts'
  'assets/scss'
)

token_file='assets/scss/_variables_project.scss'
token_import='dude-pack-strata-visual/tokens/strata.scss'

fail=0

echo "== Microsoft brand smoke check =="

# 1) No raw brand hex in authored content/templates/SCSS.
hits=""
for glob in "${search_globs[@]}"; do
  [ -e "$glob" ] || continue
  if matches="$(grep -RInEi "$brand_any" "$glob" 2>/dev/null \
      | grep -viE 'dude-pack-strata-visual/tokens/' || true)"; then
    if [ -n "$matches" ]; then
      hits+="$matches"$'\n'
    fi
  fi
done

if [ -n "$hits" ]; then
  echo "FAIL: raw Microsoft brand hex found. Use the token (var(--strata-*) / \$strata-*) instead:"
  echo "$hits" | sed '/^$/d'
  fail=1
else
  echo "OK: no raw brand hex in content/, layouts/, assets/scss/."
fi

# 2) SCSS token import is intact so every rendered page inherits the brand.
if [ -f "$token_file" ] && grep -qF "$token_import" "$token_file"; then
  echo "OK: $token_file imports the brand tokens."
else
  echo "FAIL: $token_file is missing the '$token_import' import; pages will not inherit the brand."
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "== brand check FAILED =="
  exit 1
fi

echo "== brand check passed =="