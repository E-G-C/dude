#!/usr/bin/env bash
# Strata token validator.
#
# Validates THIS pack folder. It does not inspect, assume, or require a
# consuming project, and it knows nothing about any site generator or build
# tool. (The predecessor resolved a root four levels up and checked Hugo
# paths, so it could never validate the tokens it shipped alongside.)
#
# Checks:
#   1. No raw colour literal outside tokens/ - hex AND rgb()/rgba()/hsl().
#   2. Spacing on the 4/8 scale; no radius above the 8px ceiling.
#   3. No box-shadow, backdrop-filter, or filter: blur() anywhere.
#   4. No CSS easing keyword used as a token value.
#   5. prefers-reduced-motion present.
#   6. Cross-palette id parity across all four palette/theme blocks.
#   7. No structural token inside a palette block.
#   8. Components reference role tokens, not series slots.
#   9. No @font-face and no remote font import.
#
# Usage: bash scripts/strata-check.sh
# Exit:  0 = clean, 1 = problems found.

set -euo pipefail

skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$skill_root"

css='tokens/strata.css'
scss='tokens/strata.scss'
json='tokens/strata-tokens.json'
twp='tokens/tailwind.preset.js'

fail=0

echo "== strata token check (folder-local: $skill_root) =="

for f in "$css" "$scss" "$json" "$twp"; do
  [ -f "$f" ] || { echo "FAIL: missing token file $f"; fail=1; }
done

# --- 1. Raw colour literals outside tokens/ ------------------------------
# reference/colors.md and reference/provenance-and-licensing.md document the
# values, so they are the one legitimate home for literals outside tokens/.
colour_re='#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\('
raw="$(grep -RInE "$colour_re" examples reference 2>/dev/null \
       | grep -vE 'reference/(colors|provenance-and-licensing)\.md' || true)"
if [ -n "$raw" ]; then
  echo "FAIL: raw colour literal outside tokens/ (use a --strata-* token):"
  echo "$raw" | sed 's/^/  /'
  fail=1
else
  echo "OK: no raw colour literals in examples/ or reference/ prose."
fi

# --- 2. Spacing scale and the 8px radius ceiling -------------------------
offscale="$(grep -RInE '(padding|margin|gap)[^;]*[^0-9]([0-9]+)px' "$css" "$scss" examples 2>/dev/null \
           | grep -vE '[^0-9](0|4|8|12|16|24|32|48|64)px' || true)"
if [ -n "$offscale" ]; then
  echo "FAIL: off-scale spacing literal (scale is 0/4/8/12/16/24/32/48/64):"
  echo "$offscale" | sed 's/^/  /'
  fail=1
else
  echo "OK: spacing literals are on-scale."
fi

badradius="$(grep -RInE 'border-radius:\s*[0-9]+px' "$css" "$scss" examples 2>/dev/null \
            | grep -vE 'border-radius:\s*(0|1|2|4|8)px' || true)"
if [ -n "$badradius" ]; then
  echo "FAIL: raw border-radius above the 8px ceiling:"
  echo "$badradius" | sed 's/^/  /'
  fail=1
else
  echo "OK: no raw radius above the 8px ceiling."
fi

# --- 3. Stratification: no shadow, no blur, no glass ---------------------
shadowy="$(grep -RInE '(box-shadow|backdrop-filter)[[:space:]]*:|filter[[:space:]]*:[[:space:]]*blur' "$css" "$scss" "$twp" examples 2>/dev/null \
          | grep -vE ':[[:space:]]*(//|\*|/\*|#)' || true)"
if [ -n "$shadowy" ]; then
  echo "FAIL: box-shadow / backdrop-filter / blur found. Strata uses planes and 1px rules:"
  echo "$shadowy" | sed 's/^/  /'
  fail=1
else
  echo "OK: no shadows, blurs, or glass effects."
fi

# --- 4. Easing keyword used as a token value -----------------------------
# `ease-out` silently means cubic-bezier(0, 0, 0.58, 1). Expressing an easing
# token as a keyword is how a cross-format disagreement hid in plain sight.
if grep -nE '(--strata-ease-[a-z]+|\$strata-ease-[a-z]+)\s*:\s*(ease|ease-in|ease-out|ease-in-out|linear)\s*;' \
     "$css" "$scss" >/dev/null 2>&1; then
  echo "FAIL: an easing token is defined with a CSS keyword. Use explicit cubic-bezier()."
  grep -nE '[-$]strata-ease' "$css" "$scss" | sed 's/^/  /'
  fail=1
else
  echo "OK: all easing tokens are explicit cubic-bezier()."
fi

# --- 5. Reduced motion ---------------------------------------------------
if grep -q 'prefers-reduced-motion' "$css"; then
  echo "OK: prefers-reduced-motion block present."
else
  echo "FAIL: $css has no prefers-reduced-motion block."
  fail=1
fi

# --- 6/7. Cross-palette id parity, and no structure in a palette block ---
# An id present in one palette/theme block and missing from another is a
# SILENT runtime failure: the custom property simply stops resolving after a
# palette switch, with no error anywhere. Assert it mechanically.
parity="$(node - "$css" <<'NODE'
const fs = require('fs');
const css = fs.readFileSync(process.argv[2], 'utf8');

function block(sel) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1].includes(sel) && m[2].includes('--strata-')) {
      // Not line-anchored: several declarations share a line.
      return new Map([...m[2].matchAll(/--strata-([a-z0-9-]+)\s*:\s*([^;]+);/g)]
        .map((d) => [d[1], d[2].trim()]));
    }
  }
  return new Map();
}

const blocks = {};
for (const p of ['pigment', 'spectrum']) {
  blocks[`${p}-light`] = block(`[data-strata-palette="${p}"]`);
  blocks[`${p}-dark`] = block(`[data-strata-palette="${p}"][data-strata-theme="dark"]`);
}

const problems = [];
for (const [name, b] of Object.entries(blocks)) {
  if (b.size === 0) problems.push(`palette block ${name} is empty or unparseable`);
}

const names = Object.keys(blocks);
for (let i = 0; i < names.length; i += 1) {
  for (let j = i + 1; j < names.length; j += 1) {
    const a = names[i]; const b = names[j];
    const A = new Set(blocks[a].keys()); const B = new Set(blocks[b].keys());
    const onlyA = [...A].filter((k) => !B.has(k));
    const onlyB = [...B].filter((k) => !A.has(k));
    if (onlyA.length || onlyB.length) {
      problems.push(`id parity ${a} vs ${b}: only-${a}=[${onlyA}] only-${b}=[${onlyB}]`);
    }
  }
}

// A palette block carries colour only. Structure is single-sourced; letting a
// spacing or radius value in is how two palettes drift into two design systems.
const structural = /^(space|radius|fs|lh|dur|ease|fw|reading|meta|font|plane|rule-width)-?/;
for (const [name, b] of Object.entries(blocks)) {
  const stray = [...b.keys()].filter((k) => structural.test(k));
  if (stray.length) problems.push(`structural token inside palette block ${name}: [${stray}]`);
}

if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log(`${Object.keys(blocks).length} palette blocks, ${blocks['pigment-light'].size} ids each`);
NODE
)" || { echo "FAIL: cross-palette parity"; echo "$parity" | sed 's/^/  /'; fail=1; parity=""; }
if [ -n "$parity" ]; then
  echo "OK: cross-palette id parity ($parity)."
  echo "OK: palette blocks carry colour only."
fi

# --- 8. Components must use role tokens, not series slots ----------------
# A component bound to series-1 still works, but it has silently bound itself
# to a slot rather than to the primary role.
leak="$(grep -nE '^\.strata-(btn|panel|input|reading|stack|fill)[^{]*\{[^}]*var\(--strata-series-' "$css" || true)"
if [ -n "$leak" ]; then
  echo "FAIL: a component rule references a series slot where a role token exists:"
  echo "$leak" | sed 's/^/  /'
  fail=1
else
  echo "OK: components reference role tokens only."
fi

# --- 9. Fonts are local-only --------------------------------------------
fontleak="$(grep -RInE '@font-face[[:space:]]*\{|@import[^;]*(https?://|//fonts\.)|href="https?://[^"]*font' \
             tokens reference examples 2>/dev/null || true)"
if [ -n "$fontleak" ]; then
  echo "FAIL: font file or remote font import found. Strata is local-only:"
  echo "$fontleak" | sed 's/^/  /'
  fail=1
else
  echo "OK: no @font-face and no remote font import."
fi

if [ "$fail" -ne 0 ]; then
  echo "== strata token check FAILED =="
  exit 1
fi

echo "== strata token check passed =="
