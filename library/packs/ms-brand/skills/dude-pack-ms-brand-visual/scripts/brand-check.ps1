#!/usr/bin/env pwsh
# Microsoft visual-brand smoke check (internal use only).
#
# Fails when raw Microsoft brand hex codes leak into authored content,
# templates, or SCSS, or when the SCSS token import is missing. This is a
# fast drift guard, not a full brand audit -- pair it with the
# `@dude-pack-ms-brand-stylist` agent for visual review.
#
# Usage:  pwsh .github/skills/dude-pack-ms-brand-visual/scripts/brand-check.ps1
# Exit:   0 = clean, 1 = brand drift found.

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..' '..' '..' '..')
Set-Location $repoRoot

# Microsoft four-square + neutral brand hex codes that must come from tokens.
$brandHex = '#F25022|#7FBA00|#00A4EF|#FFB900|#737373'

# Authored surfaces Hugo renders. Token files are the one legitimate home
# for the raw hex, so matches under them are excluded.
$searchGlobs = @('content', 'layouts', 'assets/scss')

$tokenFile = 'assets/scss/_variables_project.scss'
$tokenImport = 'dude-pack-ms-brand-visual/tokens/ms-brand.scss'

$fail = $false

Write-Host '== Microsoft brand smoke check =='

# 1) No raw brand hex in authored content/templates/SCSS.
$hits = @()
foreach ($glob in $searchGlobs) {
    if (-not (Test-Path $glob)) { continue }
    $matches = Get-ChildItem -Path $glob -Recurse -File -ErrorAction SilentlyContinue |
        Select-String -Pattern $brandHex -CaseSensitive:$false |
        Where-Object { $_.Path -notmatch 'dude-pack-ms-brand-visual[\/]+tokens[\/]+' }
    if ($matches) { $hits += $matches }
}

if ($hits.Count -gt 0) {
    Write-Host 'FAIL: raw Microsoft brand hex found. Use the token (var(--ms-*) / $ms-*) instead:'
    foreach ($m in $hits) {
        Write-Host ("  {0}:{1}: {2}" -f $m.Path, $m.LineNumber, $m.Line.Trim())
    }
    $fail = $true
} else {
    Write-Host 'OK: no raw brand hex in content/, layouts/, assets/scss/.'
}

# 2) SCSS token import is intact so every rendered page inherits the brand.
if ((Test-Path $tokenFile) -and (Select-String -Path $tokenFile -SimpleMatch -Pattern $tokenImport -Quiet)) {
    Write-Host "OK: $tokenFile imports the brand tokens."
} else {
    Write-Host "FAIL: $tokenFile is missing the '$tokenImport' import; pages will not inherit the brand."
    $fail = $true
}

if ($fail) {
    Write-Host '== brand check FAILED =='
    exit 1
}

Write-Host '== brand check passed =='