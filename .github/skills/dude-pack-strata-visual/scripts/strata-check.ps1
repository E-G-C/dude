#!/usr/bin/env pwsh
# Strata token validator.
#
# Validates THIS pack folder. It does not inspect, assume, or require a
# consuming project, and it knows nothing about any site generator or build
# tool. Mirrors scripts/strata-check.sh check for check.
#
# Usage: pwsh scripts/strata-check.ps1
# Exit:  0 = clean, 1 = problems found.

$ErrorActionPreference = 'Stop'

$skillRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $skillRoot

$css  = 'tokens/strata.css'
$scss = 'tokens/strata.scss'
$json = 'tokens/strata-tokens.json'
$twp  = 'tokens/tailwind.preset.js'

$fail = $false

Write-Host "== strata token check (folder-local: $skillRoot) =="

foreach ($f in @($css, $scss, $json, $twp)) {
    if (-not (Test-Path $f)) { Write-Host "FAIL: missing token file $f"; $fail = $true }
}

# --- 1. Raw colour literals outside tokens/ ------------------------------
$colourRe = '#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\('
$found = Get-ChildItem -Path 'examples', 'reference' -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch 'reference[\\/](colors|provenance-and-licensing)\.md$' } |
    Select-String -Pattern $colourRe
if ($found) {
    Write-Host 'FAIL: raw colour literal outside tokens/ (use a --strata-* token):'
    foreach ($m in $found) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: no raw colour literals in examples/ or reference/ prose.'
}

# --- 2. Spacing scale and the 8px radius ceiling -------------------------
$allowedSpace = @(0, 4, 8, 12, 16, 24, 32, 48, 64)
$offScale = Get-ChildItem -Path $css, $scss, 'examples' -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern '(padding|margin|gap)[^;]*?(\d+)px' -AllMatches |
    Where-Object {
        $_.Matches | ForEach-Object { [int]$_.Groups[2].Value } |
            Where-Object { $allowedSpace -notcontains $_ }
    }
if ($offScale) {
    Write-Host 'FAIL: off-scale spacing literal (scale is 0/4/8/12/16/24/32/48/64):'
    foreach ($m in $offScale) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: spacing literals are on-scale.'
}

$badRadius = Get-ChildItem -Path $css, $scss, 'examples' -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern 'border-radius:\s*(\d+)px' -AllMatches |
    Where-Object {
        $_.Matches | ForEach-Object { [int]$_.Groups[1].Value } | Where-Object { $_ -gt 8 }
    }
if ($badRadius) {
    Write-Host 'FAIL: raw border-radius above the 8px ceiling:'
    foreach ($m in $badRadius) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: no raw radius above the 8px ceiling.'
}

# --- 3. Stratification: no shadow, no blur, no glass ---------------------
# Declarations only, so prose that mentions box-shadow is not a false positive.
$shadowy = Get-ChildItem -Path $css, $scss, $twp, 'examples' -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern '(box-shadow|backdrop-filter)\s*:|filter\s*:\s*blur' |
    Where-Object { $_.Line -notmatch ':\s*(//|\*|/\*|#)' }
if ($shadowy) {
    Write-Host 'FAIL: box-shadow / backdrop-filter / blur found. Strata uses planes and 1px rules:'
    foreach ($m in $shadowy) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: no shadows, blurs, or glass effects.'
}

# --- 4. Easing keyword used as a token value -----------------------------
# `ease-out` silently means cubic-bezier(0, 0, 0.58, 1). Expressing an easing
# token as a keyword is how a cross-format disagreement hid in plain sight.
$keywordEase = Select-String -Path $css, $scss `
    -Pattern '[-$]{1,2}strata-ease-[a-z]+\s*:\s*(ease|ease-in|ease-out|ease-in-out|linear)\s*;'
if ($keywordEase) {
    Write-Host 'FAIL: an easing token is defined with a CSS keyword. Use explicit cubic-bezier().'
    foreach ($m in $keywordEase) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: all easing tokens are explicit cubic-bezier().'
}

# --- 5. Reduced motion ---------------------------------------------------
if (Select-String -Path $css -SimpleMatch -Pattern 'prefers-reduced-motion' -Quiet) {
    Write-Host 'OK: prefers-reduced-motion block present.'
} else {
    Write-Host "FAIL: $css has no prefers-reduced-motion block."
    $fail = $true
}

# --- 6/7. Cross-palette id parity, and no structure in a palette block ---
# An id present in one palette/theme block and missing from another is a SILENT
# runtime failure: the custom property stops resolving after a palette switch,
# with no error anywhere. Assert it mechanically.
$cssText = Get-Content $css -Raw

function Get-PaletteBlock([string]$sel) {
    $ids = [ordered]@{}
    foreach ($m in [regex]::Matches($cssText, '([^{}]+)\{([^{}]*)\}')) {
        if ($m.Groups[1].Value.Contains($sel) -and $m.Groups[2].Value.Contains('--strata-')) {
            # Not line-anchored: several declarations share a line.
            foreach ($d in [regex]::Matches($m.Groups[2].Value, '--strata-([a-z0-9-]+)\s*:\s*([^;]+);')) {
                $ids[$d.Groups[1].Value] = $d.Groups[2].Value.Trim()
            }
            return $ids
        }
    }
    return $ids
}

$blocks = [ordered]@{}
foreach ($p in @('pigment', 'spectrum')) {
    $blocks["$p-light"] = Get-PaletteBlock "[data-strata-palette=`"$p`"]"
    $blocks["$p-dark"]  = Get-PaletteBlock "[data-strata-palette=`"$p`"][data-strata-theme=`"dark`"]"
}

$parityProblems = @()
foreach ($name in $blocks.Keys) {
    if ($blocks[$name].Count -eq 0) { $parityProblems += "palette block $name is empty or unparseable" }
}
$names = @($blocks.Keys)
for ($i = 0; $i -lt $names.Count; $i++) {
    for ($j = $i + 1; $j -lt $names.Count; $j++) {
        $a = $names[$i]; $b = $names[$j]
        $A = @($blocks[$a].Keys); $B = @($blocks[$b].Keys)
        $onlyA = $A | Where-Object { $B -notcontains $_ }
        $onlyB = $B | Where-Object { $A -notcontains $_ }
        if ($onlyA -or $onlyB) {
            $parityProblems += "id parity $a vs ${b}: only-$a=[$($onlyA -join ',')] only-$b=[$($onlyB -join ',')]"
        }
    }
}

# A palette block carries colour only. Structure is single-sourced; letting a
# spacing or radius value in is how two palettes drift into two design systems.
$structural = '^(space|radius|fs|lh|dur|ease|fw|reading|meta|font|plane|rule-width)-?'
foreach ($name in $blocks.Keys) {
    $stray = @($blocks[$name].Keys) | Where-Object { $_ -match $structural }
    if ($stray) { $parityProblems += "structural token inside palette block ${name}: [$($stray -join ',')]" }
}

if ($parityProblems) {
    Write-Host 'FAIL: cross-palette parity'
    foreach ($p in $parityProblems) { Write-Host "  $p" }
    $fail = $true
} else {
    Write-Host "OK: cross-palette id parity ($($blocks.Count) palette blocks, $($blocks['pigment-light'].Count) ids each)."
    Write-Host 'OK: palette blocks carry colour only.'
}

# --- 8. Components must use role tokens, not series slots ----------------
$leak = Select-String -Path $css -Pattern '^\.strata-(btn|panel|input|reading|stack|fill)[^{]*\{[^}]*var\(--strata-series-'
if ($leak) {
    Write-Host 'FAIL: a component rule references a series slot where a role token exists:'
    foreach ($m in $leak) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: components reference role tokens only.'
}

# --- 9. Fonts are local-only ---------------------------------------------
$fontLeak = Get-ChildItem -Path 'tokens', 'reference', 'examples' -Recurse -File -ErrorAction SilentlyContinue |
    Select-String -Pattern '@font-face\s*\{|@import[^;]*(https?://|//fonts\.)|href="https?://[^"]*font'
if ($fontLeak) {
    Write-Host 'FAIL: font file or remote font import found. Strata is local-only:'
    foreach ($m in $fontLeak) { Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim()) }
    $fail = $true
} else {
    Write-Host 'OK: no @font-face and no remote font import.'
}

if ($fail) { Write-Host '== strata token check FAILED =='; exit 1 }
Write-Host '== strata token check passed =='
