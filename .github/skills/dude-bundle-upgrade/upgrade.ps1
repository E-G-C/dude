#!/usr/bin/env pwsh
# upgrade.ps1 — engine for dude-bundle-upgrade (PowerShell 7+ parity).
#
# Mirror of upgrade.sh. Identical CLI contract: same subcommands, same flags,
# same exit codes, same JSON shapes. See upgrade.sh header for the full
# documentation; this file ports the engine to PowerShell so Windows users
# (and anyone preferring pwsh) get the same workflow without invoking bash.
#
# Subcommands:
#   status     compare local manifest against upstream manifest (read-only)
#   plan       fetch upstream tree, classify every file, persist plan
#   apply      apply a persisted plan: safety tag + branch + writes + commit
#   rollback   reset HEAD to the most recent dude-pre-upgrade-* safety tag
#   help       print usage
#   version    print engine version
#
# Exit codes:
#   0   no changes (up_to_date) or successful action
#   10  plan ready, changes detected
#   40  invalid input, malformed manifest, unreachable upstream, or post-apply lint failure
#
# Manifest format: metadata only. The fenced JSON block carries source_repo,
# source_ref, installed_sha, and installed_at — no files array, no per-file
# hashes. Base ownership is derived from the namespace convention by the
# engine.
#
# Dependencies: PowerShell 7+, git, plus either Invoke-WebRequest (built-in)
# or curl on PATH for the GitHub raw fast path. tar is not required (PS uses
# git for upstream tree fetch).

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string] $Command = 'help',

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Rest
)

$ErrorActionPreference = 'Continue'
Set-StrictMode -Version 3.0

# ----- globals ---------------------------------------------------------------

$script:VERSION = '0.4.0'
$script:ROOT = (Get-Location).Path
$script:CACHE_ROOT = Join-Path ([System.IO.Path]::GetTempPath()) 'dude-upgrade-cache'
$script:PLANS_DIR = Join-Path $script:CACHE_ROOT 'plans'
$script:RESERVED_AGENT_PREFIX = '.github/agents/dude-local-'
$script:RESERVED_SKILL_PREFIX = '.github/skills/dude-local-'
$script:LOCAL_MANIFEST_PATH = Join-Path $script:ROOT '.github/dudestuff/bundle-manifest.md'

# Color only when stderr is a TTY. Approximation: use VT support flag.
if ($Host.UI.SupportsVirtualTerminal) {
    $script:CLR_YEL = "`e[33m"
    $script:CLR_RED = "`e[31m"
    $script:CLR_GRN = "`e[32m"
    $script:CLR_CYA = "`e[36m"
    $script:CLR_DIM = "`e[2m"
    $script:CLR_RST = "`e[0m"
} else {
    $script:CLR_YEL = ''; $script:CLR_RED = ''; $script:CLR_GRN = ''
    $script:CLR_CYA = ''; $script:CLR_DIM = ''; $script:CLR_RST = ''
}

# ----- logging (stderr) ------------------------------------------------------

function Write-Log {
    param([string]$Color, [string]$Message)
    [Console]::Error.WriteLine("${Color}[upgrade]${script:CLR_RST} $Message")
}
function Write-Info  { param([string]$m) Write-Log $script:CLR_CYA $m }
function Write-Warn  { param([string]$m) Write-Log $script:CLR_YEL $m }
function Write-Err   { param([string]$m) Write-Log $script:CLR_RED $m }
function Write-Debg  { param([string]$m) if ($env:UPGRADE_DEBUG) { Write-Log $script:CLR_DIM $m } }

# ----- json + date helpers ---------------------------------------------------

function ConvertTo-JsonStringLiteral {
    # Produce a quoted JSON string from arbitrary text using built-in JSON encoder.
    param([AllowNull()][AllowEmptyString()][string]$Value)
    if ($null -eq $Value) { return '""' }
    return (ConvertTo-Json -InputObject $Value -Compress)
}

function Get-ShortSha {
    param([string]$Sha)
    if ([string]::IsNullOrEmpty($Sha)) { return '' }
    if ($Sha.Length -le 12) { return $Sha }
    return $Sha.Substring(0, 12)
}

function Get-IsoNow {
    return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Get-StampNow {
    return (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
}

function Get-IsoPlusSeconds {
    param([int]$Seconds)
    return (Get-Date).ToUniversalTime().AddSeconds($Seconds).ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function ConvertFrom-IsoEpoch {
    param([string]$Iso)
    try {
        return [DateTimeOffset]::Parse($Iso).ToUnixTimeSeconds()
    } catch {
        return $null
    }
}

# ----- manifest read ---------------------------------------------------------

function Get-ManifestFencedJson {
    # Extract the fenced ```json ... ``` block as raw JSON text.
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $inBlock = $false
    $sb = [System.Text.StringBuilder]::new()
    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        if (-not $inBlock -and $line -match '^\s*```json\s*$') { $inBlock = $true; continue }
        if ($inBlock -and $line -match '^\s*```\s*$') { break }
        if ($inBlock) { [void]$sb.AppendLine($line) }
    }
    if ($sb.Length -eq 0) { return $null }
    return $sb.ToString()
}

function Get-ManifestObject {
    # Parse the fenced JSON block into a PSCustomObject.
    param([string]$Path)
    $jsonText = Get-ManifestFencedJson -Path $Path
    if ([string]::IsNullOrWhiteSpace($jsonText)) { return $null }
    try {
        return $jsonText | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-MetadataManifest {
    # Return $null on success, or a [string[]] of error lines unless the
    # manifest is exactly the metadata shape.
    param(
        [Parameter(Mandatory)][object]$Manifest,
        [Parameter(Mandatory)][string]$Label
    )

    $allowedFields = @('source_repo', 'source_ref', 'installed_sha', 'installed_at')
    $errors = New-Object System.Collections.Generic.List[string]

    foreach ($field in $Manifest.PSObject.Properties.Name) {
        if ($allowedFields -notcontains $field) {
            $errors.Add("$Label has unsupported field '$field'") | Out-Null
        }
    }

    foreach ($field in $allowedFields) {
        if (-not ($Manifest.PSObject.Properties.Name -contains $field)) {
            $errors.Add("$Label is missing $field") | Out-Null
        }
    }

    $sha = if ($Manifest.PSObject.Properties.Name -contains 'installed_sha') { [string]$Manifest.installed_sha } else { '' }
    if (-not [string]::IsNullOrEmpty($sha) -and $sha -notmatch '^[0-9a-f]{40}$') {
        $errors.Add("$Label installed_sha is not a 40-char hex sha") | Out-Null
    }

    if ($errors.Count -gt 0) { return $errors.ToArray() }
    return $null
}

# ----- base-path enumeration (namespace convention) --------------------------
#
# The metadata-only manifest carries no files array; base ownership is derived
# from the namespace convention by the engine. Anything under
#   .github/agents/dude.agent.md
#   .github/agents/dude-<slug>.agent.md           (slug NOT starting with 'local-')
#   .github/skills/dude-<slug>/**                 (slug NOT starting with 'local-')
#   .github/instructions/dude.instructions.md
# is base-owned. The reserved dude-local-<slug> namespace is project-owned
# and explicitly excluded.

function Test-BasePath {
    param([Parameter(Mandatory)][string]$RelPath)
    # Normalize separators — incoming may use either / or \.
    $p = $RelPath -replace '\\', '/'
    if ($p -eq '.github/agents/dude.agent.md') { return $true }
    if ($p -eq '.github/instructions/dude.instructions.md') { return $true }
    if ($p -match '^\.github/agents/dude-(?!local-)[^/]+\.agent\.md$') { return $true }
    if ($p -match '^\.github/skills/dude-(?!local-)[^/]+/.+$') { return $true }
    return $false
}

function Get-BasePaths {
    # Enumerate base-owned paths under a tree root in sorted order.
    param([Parameter(Mandatory)][string]$TreeRoot)
    if (-not (Test-Path -LiteralPath $TreeRoot -PathType Container)) { return @() }
    $rootFull = (Resolve-Path -LiteralPath $TreeRoot).Path
    $rootLen  = $rootFull.Length + 1
    $found = New-Object System.Collections.Generic.List[string]

    foreach ($candidate in @(
        '.github/agents/dude.agent.md',
        '.github/instructions/dude.instructions.md'
    )) {
        $abs = Join-Path $rootFull $candidate
        if (Test-Path -LiteralPath $abs -PathType Leaf) { $found.Add($candidate) | Out-Null }
    }

    $agentsDir = Join-Path $rootFull '.github/agents'
    if (Test-Path -LiteralPath $agentsDir -PathType Container) {
        Get-ChildItem -LiteralPath $agentsDir -File -Filter 'dude-*.agent.md' -ErrorAction SilentlyContinue | ForEach-Object {
            $rel = ($_.FullName.Substring($rootLen)) -replace '\\', '/'
            if ($rel -match '^\.github/agents/dude-(?!local-)[^/]+\.agent\.md$') {
                $found.Add($rel) | Out-Null
            }
        }
    }

    $skillsDir = Join-Path $rootFull '.github/skills'
    if (Test-Path -LiteralPath $skillsDir -PathType Container) {
        Get-ChildItem -LiteralPath $skillsDir -Directory -Filter 'dude-*' -ErrorAction SilentlyContinue | ForEach-Object {
            $skillName = $_.Name
            if ($skillName -like 'dude-local-*') { return }
            Get-ChildItem -LiteralPath $_.FullName -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                $rel = ($_.FullName.Substring($rootLen)) -replace '\\', '/'
                $found.Add($rel) | Out-Null
            }
        }
    }

    return @($found | Sort-Object -Culture Invariant -Unique)
}

$script:LOCAL_MANIFEST = $null
$script:LOCAL_SOURCE_REPO = ''
$script:LOCAL_SOURCE_REF = ''
$script:LOCAL_INSTALLED_SHA = ''
$script:LOCAL_INSTALLED_AT = ''

function Test-LocalManifest {
    # Load $script:LOCAL_MANIFEST_PATH into the LOCAL_* globals. Return $true
    # on success, $false on missing/malformed or non-0.4.0 manifest shape.
    if (-not (Test-Path -LiteralPath $script:LOCAL_MANIFEST_PATH)) { return $false }
    $m = Get-ManifestObject -Path $script:LOCAL_MANIFEST_PATH
    if ($null -eq $m) { return $false }
    if ($null -ne (Test-MetadataManifest -Manifest $m -Label 'local manifest')) { return $false }
    $script:LOCAL_MANIFEST = $m
    $script:LOCAL_SOURCE_REPO    = if ($m.PSObject.Properties.Name -contains 'source_repo')    { [string]$m.source_repo }    else { '' }
    $script:LOCAL_SOURCE_REF     = if ($m.PSObject.Properties.Name -contains 'source_ref')     { [string]$m.source_ref }     else { '' }
    $script:LOCAL_INSTALLED_SHA  = if ($m.PSObject.Properties.Name -contains 'installed_sha')  { [string]$m.installed_sha }  else { '' }
    $script:LOCAL_INSTALLED_AT   = if ($m.PSObject.Properties.Name -contains 'installed_at') {
        # ConvertFrom-Json auto-parses ISO-8601 strings to [datetime]; round-trip back to ISO
        # so the JSON output and text output match bash byte-for-byte instead of using the
        # local culture's short date format.
        if ($m.installed_at -is [datetime]) {
            $m.installed_at.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        } else {
            [string]$m.installed_at
        }
    } else { '' }
    if ($script:LOCAL_INSTALLED_SHA -notmatch '^[0-9a-f]{40}$') { return $false }
    return $true
}

# ----- upstream resolution ---------------------------------------------------

$script:UPSTREAM_SOURCE = ''
$script:UPSTREAM_REF = ''

function Resolve-Upstream {
    param([string]$SrcOverride, [string]$RefOverride)
    $script:UPSTREAM_SOURCE = if ($SrcOverride) { $SrcOverride } elseif ($script:LOCAL_SOURCE_REPO) { $script:LOCAL_SOURCE_REPO } else { 'https://github.com/E-G-C/dude' }
    $script:UPSTREAM_REF    = if ($RefOverride) { $RefOverride } elseif ($script:LOCAL_SOURCE_REF)  { $script:LOCAL_SOURCE_REF }  else { 'main' }
}

function Get-GithubOwnerRepo {
    param([string]$Url)
    if ($Url -notmatch '^https://github\.com/') { return $null }
    $rest = $Url -replace '^https://github\.com/', '' -replace '\.git$', '' -replace '/$', ''
    $parts = $rest -split '/'
    if ($parts.Count -lt 2) { return $null }
    return ('{0}/{1}' -f $parts[0], $parts[1])
}

function Get-CacheKey {
    param([string]$Source, [string]$Ref)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("$Source|$Ref")
        $hash = $sha.ComputeHash($bytes)
        return -join ($hash[0..5] | ForEach-Object { $_.ToString('x2') })
    } finally {
        $sha.Dispose()
    }
}

function Get-UpstreamManifestOnly {
    # Try local-path, then GitHub raw, then shallow clone. Return manifest
    # file path on success, $null on failure.
    [void](New-Item -ItemType Directory -Force -Path $script:CACHE_ROOT -ErrorAction SilentlyContinue)
    $outDir = Join-Path $script:CACHE_ROOT ("manifest-{0}" -f [Guid]::NewGuid().ToString('N').Substring(0, 8))
    [void](New-Item -ItemType Directory -Path $outDir -Force)
    $out = Join-Path $outDir 'bundle-manifest.md'
    $ownerRepo = Get-GithubOwnerRepo -Url $script:UPSTREAM_SOURCE

    # Local path source.
    if (Test-Path -LiteralPath $script:UPSTREAM_SOURCE -PathType Container) {
        $localManifest = Join-Path $script:UPSTREAM_SOURCE '.github/dudestuff/bundle-manifest.md'
        if (Test-Path -LiteralPath $localManifest) {
            Copy-Item -LiteralPath $localManifest -Destination $out -Force
            return $out
        }
        Remove-Item -Recurse -Force -LiteralPath $outDir -ErrorAction SilentlyContinue
        return $null
    }

    # GitHub raw fast path.
    if ($ownerRepo) {
        $rawUrl = "https://raw.githubusercontent.com/$ownerRepo/$($script:UPSTREAM_REF)/.github/dudestuff/bundle-manifest.md"
        Write-Debg "fetching upstream manifest via raw url: $rawUrl"
        try {
            Invoke-WebRequest -Uri $rawUrl -OutFile $out -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop | Out-Null
            if (Test-Path -LiteralPath $out -PathType Leaf) { return $out }
        } catch {
            Write-Debg "raw fetch failed: $($_.Exception.Message)"
        }
    }

    # Shallow clone fallback.
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $cloneDir = Join-Path $outDir 'clone'
        Write-Debg "shallow-cloning upstream for manifest only: $($script:UPSTREAM_SOURCE) @ $($script:UPSTREAM_REF)"
        & git clone --quiet --depth=1 --branch $script:UPSTREAM_REF $script:UPSTREAM_SOURCE $cloneDir 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $cloned = Join-Path $cloneDir '.github/dudestuff/bundle-manifest.md'
            if (Test-Path -LiteralPath $cloned) {
                Copy-Item -LiteralPath $cloned -Destination $out -Force
                return $out
            }
        }
    }

    Remove-Item -Recurse -Force -LiteralPath $outDir -ErrorAction SilentlyContinue
    return $null
}

function Get-UpstreamTree {
    # Return path to fetched upstream tree on success, $null on failure.
    [void](New-Item -ItemType Directory -Force -Path $script:CACHE_ROOT -ErrorAction SilentlyContinue)

    if (Test-Path -LiteralPath $script:UPSTREAM_SOURCE -PathType Container) {
        $localManifest = Join-Path $script:UPSTREAM_SOURCE '.github/dudestuff/bundle-manifest.md'
        if (-not (Test-Path -LiteralPath $localManifest)) {
            Write-Err "local upstream source is missing .github/dudestuff/bundle-manifest.md"
            return $null
        }
        return $script:UPSTREAM_SOURCE
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Err "git is required to fetch upstream tree"
        return $null
    }

    $key = Get-CacheKey -Source $script:UPSTREAM_SOURCE -Ref $script:UPSTREAM_REF
    $dest = Join-Path $script:CACHE_ROOT "upstream-$key"

    if ((Test-Path -LiteralPath (Join-Path $dest '.git')) -and (Test-Path -LiteralPath (Join-Path $dest '.github/dudestuff/bundle-manifest.md'))) {
        return $dest
    }

    Remove-Item -Recurse -Force -LiteralPath $dest -ErrorAction SilentlyContinue
    Write-Info "fetching upstream tree: $($script:UPSTREAM_SOURCE) @ $($script:UPSTREAM_REF)"
    & git clone --quiet --depth=1 --branch $script:UPSTREAM_REF $script:UPSTREAM_SOURCE $dest 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { return $dest }

    # Commit-sha ref fallback.
    & git clone --quiet $script:UPSTREAM_SOURCE $dest 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Push-Location $dest
        try {
            & git checkout --quiet $script:UPSTREAM_REF 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { return $dest }
        } finally { Pop-Location }
    }

    Remove-Item -Recurse -Force -LiteralPath $dest -ErrorAction SilentlyContinue
    Write-Err "failed to fetch upstream from $($script:UPSTREAM_SOURCE) @ $($script:UPSTREAM_REF)"
    return $null
}

function Get-TreeHeadSha {
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath (Join-Path $Dir '.git'))) { return '' }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return '' }
    $sha = & git -C $Dir rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return ([string]$sha).Trim()
}

# ----- upstream manifest validation ------------------------------------------

function Test-UpstreamManifest {
    # Return $null on success, or a [string[]] of error lines on failure.
    param([Parameter(Mandatory)][object]$Manifest)
    return Test-MetadataManifest -Manifest $Manifest -Label 'upstream manifest'
}

# ----- classification --------------------------------------------------------

$script:CLS_REPLACE = New-Object System.Collections.Generic.List[psobject]   # { path; added_lines; removed_lines }
$script:CLS_ADD = New-Object System.Collections.Generic.List[string]
$script:CLS_REMOVE = New-Object System.Collections.Generic.List[string]
$script:CLS_ADVISORY = New-Object System.Collections.Generic.List[psobject]  # { path; kind }
$script:CLS_UPTODATE_COUNT = 0

function Test-FilesByteEqual {
    param([string]$A, [string]$B)
    if (-not (Test-Path -LiteralPath $A) -or -not (Test-Path -LiteralPath $B)) { return $false }
    $sizeA = (Get-Item -LiteralPath $A).Length
    $sizeB = (Get-Item -LiteralPath $B).Length
    if ($sizeA -ne $sizeB) { return $false }
    if ($sizeA -eq 0) { return $true }
    $bytesA = [System.IO.File]::ReadAllBytes($A)
    $bytesB = [System.IO.File]::ReadAllBytes($B)
    return [System.Linq.Enumerable]::SequenceEqual([byte[]]$bytesA, [byte[]]$bytesB)
}

function Get-DiffPlusMinus {
    param([string]$A, [string]$B)
    if (-not (Test-Path -LiteralPath $A) -or -not (Test-Path -LiteralPath $B)) {
        return [pscustomobject]@{ Plus = 0; Minus = 0 }
    }
    $linesA = @(Get-Content -LiteralPath $A -ErrorAction SilentlyContinue)
    $linesB = @(Get-Content -LiteralPath $B -ErrorAction SilentlyContinue)
    if ($linesA.Count -eq 0 -and $linesB.Count -eq 0) {
        return [pscustomobject]@{ Plus = 0; Minus = 0 }
    }
    if ($linesA.Count -eq 0) { return [pscustomobject]@{ Plus = $linesB.Count; Minus = 0 } }
    if ($linesB.Count -eq 0) { return [pscustomobject]@{ Plus = 0; Minus = $linesA.Count } }
    $cmp = Compare-Object -ReferenceObject $linesA -DifferenceObject $linesB
    if ($null -eq $cmp) { return [pscustomobject]@{ Plus = 0; Minus = 0 } }
    $plus  = @($cmp | Where-Object { $_.SideIndicator -eq '=>' }).Count
    $minus = @($cmp | Where-Object { $_.SideIndicator -eq '<=' }).Count
    return [pscustomobject]@{ Plus = $plus; Minus = $minus }
}

function Invoke-ClassifyPlan {
    # Classification model (namespace-based, no manifest files array, no
    # per-file hashes):
    #   * Base ownership is derived via Get-BasePaths.
    #   * Local edits to base files are detected at apply time via the on-disk
    #     byte compare here, not by hashing the manifest.
    #   * Buckets:
    #       replace    -- base path on both sides, on-disk bytes differ from upstream
    #       add        -- base path only in the upstream tree
    #       remove     -- base path only in the local tree (upstream dropped it)
    #       advisory   -- project-owned agent/skill outside both the base and
    #                     dude-local- namespaces (informational only)
    #       up_to_date -- base path on both sides, bytes match (counted only)
    param([string]$UpstreamTree)

    $script:CLS_REPLACE.Clear()
    $script:CLS_ADD.Clear()
    $script:CLS_REMOVE.Clear()
    $script:CLS_ADVISORY.Clear()
    $script:CLS_UPTODATE_COUNT = 0

    $localPaths    = Get-BasePaths -TreeRoot $script:ROOT
    $upstreamPaths = Get-BasePaths -TreeRoot $UpstreamTree

    $localSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($p in $localPaths) { [void]$localSet.Add($p) }
    $upstreamSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($p in $upstreamPaths) { [void]$upstreamSet.Add($p) }

    foreach ($upath in $upstreamPaths) {
        if ([string]::IsNullOrEmpty($upath)) { continue }
        $localDisk = Join-Path $script:ROOT $upath
        $upstreamFile = Join-Path $UpstreamTree $upath

        if (-not $localSet.Contains($upath)) {
            $script:CLS_ADD.Add($upath) | Out-Null
            continue
        }

        if (-not (Test-Path -LiteralPath $localDisk -PathType Leaf)) {
            # In local namespace enumeration but missing on disk (rare race)
            # — treat as replace so the file gets restored from upstream.
            $script:CLS_REPLACE.Add([pscustomobject]@{ path = $upath; added_lines = 0; removed_lines = 0 }) | Out-Null
            continue
        }

        if (Test-FilesByteEqual -A $localDisk -B $upstreamFile) {
            $script:CLS_UPTODATE_COUNT++
        } else {
            $pm = Get-DiffPlusMinus -A $localDisk -B $upstreamFile
            $script:CLS_REPLACE.Add([pscustomobject]@{ path = $upath; added_lines = $pm.Plus; removed_lines = $pm.Minus }) | Out-Null
        }
    }

    foreach ($lpath in $localPaths) {
        if ([string]::IsNullOrEmpty($lpath)) { continue }
        if (-not $upstreamSet.Contains($lpath)) {
            $script:CLS_REMOVE.Add($lpath) | Out-Null
        }
    }

    # Advisories — project-owned agents/skills outside both the base and
    # dude-local- namespaces. Informational only; apply never touches them.
    $agentsDir = Join-Path $script:ROOT '.github/agents'
    if (Test-Path -LiteralPath $agentsDir -PathType Container) {
        Get-ChildItem -LiteralPath $agentsDir -File -Filter '*.agent.md' -ErrorAction SilentlyContinue | ForEach-Object {
            $rel = ($_.FullName.Substring($script:ROOT.Length + 1)) -replace '\\', '/'
            $bn = Split-Path -Leaf $rel
            if ($bn -eq 'dude.agent.md') { return }
            if ($bn -like 'dude-local-*') { return }
            if ($bn -like 'dude-*') { return }
            $script:CLS_ADVISORY.Add([pscustomobject]@{ path = $rel; kind = 'unreserved_local_agent' }) | Out-Null
        }
    }
    $skillsDir = Join-Path $script:ROOT '.github/skills'
    if (Test-Path -LiteralPath $skillsDir -PathType Container) {
        Get-ChildItem -LiteralPath $skillsDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $bn = $_.Name
            if ($bn -eq 'project') { return }
            if ($bn -like 'dude-local-*') { return }
            if ($bn -like 'dude-*') { return }
            $skillMd = Join-Path $_.FullName 'SKILL.md'
            if (-not (Test-Path -LiteralPath $skillMd -PathType Leaf)) { return }
            $relMd = (".github/skills/{0}/SKILL.md" -f $bn)
            $script:CLS_ADVISORY.Add([pscustomobject]@{ path = $relMd; kind = 'unreserved_local_skill' }) | Out-Null
        }
    }
}

# ----- emitters --------------------------------------------------------------

function Emit-StatusText {
    param([string]$Kind, [string]$UpstreamSha, [string]$Detail)
    Write-Host -NoNewline 'Bundle: '
    switch ($Kind) {
        'up_to_date'        { Write-Host "${script:CLR_GRN}up to date${script:CLR_RST}" }
        'upgrade_available' { Write-Host "${script:CLR_YEL}upgrade available${script:CLR_RST}" }
        'offline'           { Write-Host "${script:CLR_YEL}upgrade status unavailable ($Detail)${script:CLR_RST}" }
        'error'             { Write-Host "${script:CLR_RED}error ($Detail)${script:CLR_RST}" }
        default             { Write-Host $Kind }
    }
    Write-Host "  Source:    $($script:UPSTREAM_SOURCE) @ $($script:UPSTREAM_REF)"
    Write-Host "  Installed: $(Get-ShortSha $script:LOCAL_INSTALLED_SHA) ($($script:LOCAL_INSTALLED_AT))"
    if ($Kind -eq 'upgrade_available' -or $Kind -eq 'up_to_date') {
        if ($UpstreamSha) { Write-Host "  Upstream:  $(Get-ShortSha $UpstreamSha)" }
    }
    if ($Kind -eq 'upgrade_available') {
        Write-Host "  Next:      @dude upgrade --dry-run"
    }
}

function Emit-StatusJson {
    param([string]$Kind, [string]$UpstreamSha, [string]$Detail)
    $obj = [ordered]@{
        status         = $Kind
        source         = $script:UPSTREAM_SOURCE
        ref            = $script:UPSTREAM_REF
        installed_sha  = $script:LOCAL_INSTALLED_SHA
        installed_at   = $script:LOCAL_INSTALLED_AT
        upstream_sha   = $UpstreamSha
        detail         = $Detail
    }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Depth 6))
}

function Emit-PlanText {
    param([string]$PlanId, [string]$FromSha, [string]$ToSha, [string]$CacheDir)
    $nReplace = $script:CLS_REPLACE.Count
    $nAdd = $script:CLS_ADD.Count
    $nRemove = $script:CLS_REMOVE.Count
    $nAdv = $script:CLS_ADVISORY.Count

    Write-Host "Upgrade report: $(Get-ShortSha $FromSha) -> $(Get-ShortSha $ToSha)"
    Write-Host "Source: $($script:UPSTREAM_SOURCE) @ $($script:UPSTREAM_REF)"
    Write-Host "Plan ID: $PlanId"
    Write-Host "Cache: $CacheDir"
    Write-Host ''

    function _emitSection($label, $count, $rows, $fmt) {
        Write-Host "$label ($count):"
        if ($count -eq 0) { Write-Host '  (none)' }
        else {
            foreach ($r in $rows) {
                switch ($fmt) {
                    'replace'  { Write-Host ("  {0}  [+{1} / -{2}]" -f $r.path, $r.added_lines, $r.removed_lines) }
                    'advisory' { Write-Host ("  {0}  ({1})" -f $r.path, $r.kind) }
                    default    { Write-Host "  $r" }
                }
            }
        }
        Write-Host ''
    }
    _emitSection 'Will replace (overwrite)'   $nReplace   $script:CLS_REPLACE   'replace'
    _emitSection 'Will add'                   $nAdd       $script:CLS_ADD       'plain'
    _emitSection 'Will remove'                $nRemove    $script:CLS_REMOVE    'plain'
    _emitSection 'Advisories'                 $nAdv       $script:CLS_ADVISORY  'advisory'
    Write-Host "Up to date: $($script:CLS_UPTODATE_COUNT)"

    if (($nReplace + $nAdd + $nRemove) -eq 0) {
        Write-Host ''
        Write-Host "${script:CLR_GRN}Already up to date.${script:CLR_RST} Nothing to apply."
    } else {
        Write-Host ''
        Write-Host "${script:CLR_GRN}Ready to apply.${script:CLR_RST} Reply ""confirm upgrade"" to proceed."
        if ($nReplace -gt 0 -or $nRemove -gt 0) {
            Write-Host "${script:CLR_YEL}Note:${script:CLR_RST} any local edits to files in the Replace or Remove list will be"
            Write-Host 'discarded. Base files are upstream-owned; copy them under .github/agents/dude-local-<slug>.agent.md'
            Write-Host 'or .github/skills/dude-local-<slug>/ before upgrading if you need to keep edits.'
        }
    }
}

function Get-PlanObject {
    param(
        [string]$PlanId, [string]$FromSha, [string]$ToSha, [string]$CacheDir,
        [string]$CreatedAt, [string]$TtlWarn, [string]$TtlExpire
    )
    return [ordered]@{
        plan_id       = $PlanId
        created_at    = $CreatedAt
        ttl_warn_at   = $TtlWarn
        ttl_expire_at = $TtlExpire
        source        = $script:UPSTREAM_SOURCE
        ref           = $script:UPSTREAM_REF
        from_sha      = $FromSha
        to_sha        = $ToSha
        cache_dir     = $CacheDir
        summary       = [ordered]@{
            replace    = $script:CLS_REPLACE.Count
            add        = $script:CLS_ADD.Count
            remove     = $script:CLS_REMOVE.Count
            advisory   = $script:CLS_ADVISORY.Count
            up_to_date = $script:CLS_UPTODATE_COUNT
        }
        buckets       = [ordered]@{
            replace  = @($script:CLS_REPLACE  | ForEach-Object { [ordered]@{ path = $_.path; added_lines = [int]$_.added_lines; removed_lines = [int]$_.removed_lines } })
            add      = @($script:CLS_ADD      | ForEach-Object { [ordered]@{ path = $_ } })
            remove   = @($script:CLS_REMOVE   | ForEach-Object { [ordered]@{ path = $_ } })
            advisory = @($script:CLS_ADVISORY | ForEach-Object { [ordered]@{ path = $_.path; kind = $_.kind } })
        }
    }
}

function Emit-PlanJson {
    param(
        [string]$PlanId, [string]$FromSha, [string]$ToSha, [string]$CacheDir,
        [string]$CreatedAt, [string]$TtlWarn, [string]$TtlExpire
    )
    $obj = Get-PlanObject -PlanId $PlanId -FromSha $FromSha -ToSha $ToSha -CacheDir $CacheDir `
        -CreatedAt $CreatedAt -TtlWarn $TtlWarn -TtlExpire $TtlExpire
    return (ConvertTo-Json -InputObject $obj -Depth 10)
}

function Emit-ApplyText {
    param(
        [string]$SafetyTag, [string]$Branch,
        [int]$Replaced, [int]$Added, [int]$Removed,
        [int]$RemDeferred,
        [string]$Lint, [string]$FromSha, [string]$ToSha
    )
    Write-Host "Applied: $(Get-ShortSha $FromSha) -> $(Get-ShortSha $ToSha)"
    Write-Host "  replaced:             $Replaced"
    Write-Host "  added:                $Added"
    Write-Host "  removed:              $Removed"
    Write-Host "  removals deferred:    $RemDeferred"
    Write-Host "  safety tag:           $SafetyTag"
    Write-Host "  upgrade branch:       $Branch"
    Write-Host "  lint:                 [$Lint]"
    Write-Host ''
    Write-Host "Review:  git diff <target-branch>...$Branch"
    Write-Host "Rollback: pwsh .github/skills/dude-bundle-upgrade/upgrade.ps1 rollback --tag $SafetyTag"
}

function Emit-ApplyJson {
    param(
        [string]$SafetyTag, [string]$Branch,
        [int]$Replaced, [int]$Added, [int]$Removed,
        [int]$RemDeferred,
        [string]$Lint, [string]$FromSha, [string]$ToSha
    )
    $obj = [ordered]@{
        status         = 'applied'
        from_sha       = $FromSha
        to_sha         = $ToSha
        safety_tag     = $SafetyTag
        upgrade_branch = $Branch
        counts         = [ordered]@{
            replaced          = $Replaced
            added             = $Added
            removed           = $Removed
            removals_deferred = $RemDeferred
        }
        lint           = $Lint
    }
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Depth 6))
}

# ----- manifest write --------------------------------------------------------

function Write-LocalManifest {
    # Rewrites only the fenced ```json ... ``` block in the local manifest,
    # preserving surrounding markdown. The manifest is metadata only
    # (no files array, no per-file hashes). Base ownership is derived from the
    # namespace convention by the engine.
    param(
        [string]$SourceRepo, [string]$SourceRef, [string]$InstalledSha,
        [string]$InstalledAt
    )
    $original = [System.IO.File]::ReadAllLines($script:LOCAL_MANIFEST_PATH)
    $pre  = New-Object System.Collections.Generic.List[string]
    $post = New-Object System.Collections.Generic.List[string]
    $state = 0  # 0=pre, 1=inside, 2=post
    foreach ($line in $original) {
        if ($state -eq 0 -and $line -match '^\s*```json\s*$') { $pre.Add($line);  $state = 1; continue }
        if ($state -eq 1 -and $line -match '^\s*```\s*$')     { $post.Add($line); $state = 2; continue }
        if ($state -eq 0) { $pre.Add($line) }
        elseif ($state -eq 2) { $post.Add($line) }
    }

    $manifestObj = [ordered]@{
        source_repo    = $SourceRepo
        source_ref     = $SourceRef
        installed_sha  = $InstalledSha
        installed_at   = $InstalledAt
    }
    $manifestJson = ConvertTo-Json -InputObject $manifestObj -Depth 6

    $newContent = New-Object System.Collections.Generic.List[string]
    $newContent.AddRange([string[]]$pre)
    foreach ($l in ($manifestJson -split "`r?`n")) { $newContent.Add($l) }
    $newContent.AddRange([string[]]$post)

    $tmp = "$script:LOCAL_MANIFEST_PATH.tmp"
    [System.IO.File]::WriteAllLines($tmp, $newContent.ToArray())
    Move-Item -LiteralPath $tmp -Destination $script:LOCAL_MANIFEST_PATH -Force
}

# ----- plan load -------------------------------------------------------------

$script:PLAN = $null
$script:PLAN_JSON_PATH = ''

function Resolve-PlanPath {
    param([string]$Arg)
    if (Test-Path -LiteralPath $Arg -PathType Leaf) { return (Resolve-Path -LiteralPath $Arg).Path }
    $guess = Join-Path $script:PLANS_DIR "$Arg.json"
    if (Test-Path -LiteralPath $guess -PathType Leaf) { return (Resolve-Path -LiteralPath $guess).Path }
    return $null
}

function Read-Plan {
    param([string]$Path)
    try {
        $obj = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return $null
    }
    foreach ($req in @('to_sha', 'cache_dir')) {
        if (-not ($obj.PSObject.Properties.Name -contains $req)) { return $null }
        if ([string]::IsNullOrEmpty([string]$obj.$req)) { return $null }
    }
    $script:PLAN = $obj
    $script:PLAN_JSON_PATH = $Path
    return $obj
}

# ----- flag parsing ----------------------------------------------------------

function Parse-CommonFlags {
    param([string[]]$ArgList)
    if ($null -eq $ArgList) { $ArgList = @() }
    $flags = @{ Format = 'text'; Source = ''; Ref = ''; Out = '' }
    $i = 0
    while ($i -lt $ArgList.Length) {
        $a = $ArgList[$i]
        switch -Regex ($a) {
            '^--format=(.+)$'  { $flags.Format = $Matches[1]; $i++ }
            '^--format$'       { $flags.Format = $ArgList[$i + 1]; $i += 2 }
            '^--source=(.+)$'  { $flags.Source = $Matches[1]; $i++ }
            '^--source$'       { $flags.Source = $ArgList[$i + 1]; $i += 2 }
            '^--ref=(.+)$'     { $flags.Ref = $Matches[1]; $i++ }
            '^--ref$'          { $flags.Ref = $ArgList[$i + 1]; $i += 2 }
            '^--out=(.+)$'     { $flags.Out = $Matches[1]; $i++ }
            '^--out$'          { $flags.Out = $ArgList[$i + 1]; $i += 2 }
            default            { Write-Err "unknown flag: $a"; return $null }
        }
    }
    if ($flags.Format -notin @('text', 'json')) {
        Write-Err "invalid --format: $($flags.Format) (expected text|json)"
        return $null
    }
    return $flags
}

function Parse-ApplyFlags {
    param([string[]]$ArgList)
    if ($null -eq $ArgList) { $ArgList = @() }
    $flags = @{ Format='text'; Plan=''; Confirm=''; SkipRemovals=$false; AllowDirty=$false }
    $i = 0
    while ($i -lt $ArgList.Length) {
        $a = $ArgList[$i]
        switch -Regex ($a) {
            '^--plan=(.+)$'      { $flags.Plan = $Matches[1]; $i++ }
            '^--plan$'           { $flags.Plan = $ArgList[$i + 1]; $i += 2 }
            '^--confirm=(.+)$'   { $flags.Confirm = $Matches[1]; $i++ }
            '^--confirm$'        { $flags.Confirm = $ArgList[$i + 1]; $i += 2 }
            '^--skip-removals$'  { $flags.SkipRemovals = $true; $i++ }
            '^--allow-dirty$'    { $flags.AllowDirty = $true; $i++ }
            '^--format=(.+)$'    { $flags.Format = $Matches[1]; $i++ }
            '^--format$'         { $flags.Format = $ArgList[$i + 1]; $i += 2 }
            default              { Write-Err "unknown flag: $a"; return $null }
        }
    }
    if ($flags.Format -notin @('text', 'json')) {
        Write-Err "invalid --format: $($flags.Format) (expected text|json)"
        return $null
    }
    return $flags
}

function Parse-RollbackFlags {
    param([string[]]$ArgList)
    if ($null -eq $ArgList) { $ArgList = @() }
    $flags = @{ Format='text'; Tag=''; AllowDirty=$false }
    $i = 0
    while ($i -lt $ArgList.Length) {
        $a = $ArgList[$i]
        switch -Regex ($a) {
            '^--tag=(.+)$'    { $flags.Tag = $Matches[1]; $i++ }
            '^--tag$'         { $flags.Tag = $ArgList[$i + 1]; $i += 2 }
            '^--allow-dirty$' { $flags.AllowDirty = $true; $i++ }
            '^--format=(.+)$' { $flags.Format = $Matches[1]; $i++ }
            '^--format$'      { $flags.Format = $ArgList[$i + 1]; $i += 2 }
            default           { Write-Err "unknown flag: $a"; return $null }
        }
    }
    if ($flags.Format -notin @('text', 'json')) {
        Write-Err "invalid --format: $($flags.Format) (expected text|json)"
        return $null
    }
    return $flags
}

# ----- git pre-flight --------------------------------------------------------

$script:GIT_PREFLIGHT_REASON = ''

function Test-GitWorkingTree {
    $script:GIT_PREFLIGHT_REASON = ''
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        $script:GIT_PREFLIGHT_REASON = 'git is not installed; install git and re-run'
        return $false
    }
    & git -C $script:ROOT rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $script:GIT_PREFLIGHT_REASON = "not a git working tree (run 'git init' in the project root, then re-run)"
        return $false
    }
    return $true
}

function Get-GitDirty {
    $out = & git -C $script:ROOT status --porcelain 2>$null
    if ($null -eq $out) { return $false }
    return ([string]::Join('', @($out))).Trim().Length -gt 0
}

# ----- subcommands -----------------------------------------------------------

function Show-Version { [Console]::Out.WriteLine($script:VERSION) }

function Show-Help {
    $help = @'
upgrade.ps1 — engine for dude-bundle-upgrade (PowerShell parity).

USAGE
  pwsh .github/skills/dude-bundle-upgrade/upgrade.ps1 <subcommand> [flags]

SUBCOMMANDS
  status     compare local manifest against upstream manifest (read-only)
  plan       fetch upstream tree, classify every file, persist plan (read-only)
  apply      apply a persisted plan: safety tag + branch + writes + commit
  rollback   reset HEAD to the most recent dude-pre-upgrade-* safety tag
  help       this message
  version    print the script version

FLAGS (status, plan)
  --format text|json   output format (default: text)
  --source <s>         override manifest source_repo (URL or local path)
  --ref <r>            override manifest source_ref (branch, tag, or sha)

FLAGS (plan)
  --out <path>         write plan.json here in addition to /tmp cache

FLAGS (apply)
  --plan <id|path>     required: persisted plan from a previous `plan` run
  --confirm <token>    required: must be the literal string 'confirm-upgrade'
  --skip-removals      keep Remove-bucket files instead of deleting them
  --allow-dirty        permit apply on a dirty working tree (default: refuse)
  --format text|json   output format (default: text)

FLAGS (rollback)
  --tag <name>         specific safety tag to restore (default: most recent)
  --allow-dirty        permit rollback on a dirty working tree (default: refuse)
  --format text|json   output format (default: text)

EXIT CODES
  0   no changes, up-to-date, or action succeeded
  10  plan ready, changes detected
  40  invalid input, malformed manifest, unreachable upstream, or post-apply lint failure

NOTES
  Base files are identified by the namespace convention (.github/agents/dude*.agent.md,
  .github/skills/dude-*/**, .github/instructions/dude.instructions.md) and are
  upstream-owned: they will be silently overwritten on apply. To customize a
  base agent or skill, copy it under the reserved dude-local-<slug> namespace
  and edit there.

  `apply` does not push or merge. It leaves the upgrade commit on a local
  chore/dude-upgrade-<sha> branch for the user to review and merge.

ENVIRONMENT
  UPGRADE_DEBUG=1      enable debug logging on stderr
  TMPDIR               override default temp dir for the upgrade cache
'@
    [Console]::Out.WriteLine($help)
}

function Invoke-Status {
    param([string[]]$ArgList)
    $flags = Parse-CommonFlags -ArgList $ArgList
    if ($null -eq $flags) { return 40 }

    if (-not (Test-GitWorkingTree)) {
        if ($flags.Format -eq 'json') {
            $script:UPSTREAM_SOURCE = if ($flags.Source) { $flags.Source } else { 'unknown' }
            $script:UPSTREAM_REF    = if ($flags.Ref)    { $flags.Ref }    else { 'unknown' }
            Emit-StatusJson 'error' '' $script:GIT_PREFLIGHT_REASON
        } else {
            Write-Err $script:GIT_PREFLIGHT_REASON
        }
        return 40
    }

    if (-not (Test-LocalManifest)) {
        if ($flags.Format -eq 'json') {
            $script:UPSTREAM_SOURCE = if ($flags.Source) { $flags.Source } else { 'unknown' }
            $script:UPSTREAM_REF    = if ($flags.Ref)    { $flags.Ref }    else { 'unknown' }
            Emit-StatusJson 'error' '' 'local manifest missing or malformed'
        } else {
            Write-Err "local bundle manifest missing or malformed: $($script:LOCAL_MANIFEST_PATH)"
        }
        return 40
    }
    Resolve-Upstream -SrcOverride $flags.Source -RefOverride $flags.Ref

    $manifestPath = Get-UpstreamManifestOnly
    if (-not $manifestPath) {
        if ($flags.Format -eq 'json') { Emit-StatusJson 'offline' '' 'could not reach upstream' }
        else { Emit-StatusText 'offline' '' 'could not reach upstream' }
        return 0
    }
    $upstreamManifest = Get-ManifestObject -Path $manifestPath
    if ($null -eq $upstreamManifest) {
        if ($flags.Format -eq 'json') { Emit-StatusJson 'error' '' 'upstream manifest has no fenced JSON block' }
        else { Write-Err 'upstream manifest has no fenced JSON block' }
        return 40
    }
    $errs = Test-UpstreamManifest -Manifest $upstreamManifest
    if ($null -ne $errs) {
        $errs = @($errs)
        if ($flags.Format -eq 'json') { Emit-StatusJson 'error' '' $errs[0] }
        else {
            Write-Err 'upstream manifest invalid:'
            foreach ($e in $errs) { [Console]::Error.WriteLine("  $e") }
        }
        return 40
    }
    $upstreamSha = if ($upstreamManifest.PSObject.Properties.Name -contains 'installed_sha') { [string]$upstreamManifest.installed_sha } else { '' }

    # Status compares installed_sha only. Differences in the on-disk namespace
    # are surfaced by `plan`, not by status.
    $kind = if ($upstreamSha -and ($upstreamSha -eq $script:LOCAL_INSTALLED_SHA)) { 'up_to_date' } else { 'upgrade_available' }
    if ($flags.Format -eq 'json') { Emit-StatusJson $kind $upstreamSha '' }
    else { Emit-StatusText $kind $upstreamSha '' }
    return 0
}

function Invoke-Plan {
    param([string[]]$ArgList)
    $flags = Parse-CommonFlags -ArgList $ArgList
    if ($null -eq $flags) { return 40 }

    if (-not (Test-GitWorkingTree)) { Write-Err $script:GIT_PREFLIGHT_REASON; return 40 }
    if (-not (Test-LocalManifest)) { Write-Err "local bundle manifest missing or malformed: $($script:LOCAL_MANIFEST_PATH)"; return 40 }
    Resolve-Upstream -SrcOverride $flags.Source -RefOverride $flags.Ref

    $utree = Get-UpstreamTree
    if (-not $utree) { return 40 }

    $upstreamManifestPath = Join-Path $utree '.github/dudestuff/bundle-manifest.md'
    if (-not (Test-Path -LiteralPath $upstreamManifestPath -PathType Leaf)) {
        Write-Err "upstream tree is missing .github/dudestuff/bundle-manifest.md"
        return 40
    }
    $upstreamManifest = Get-ManifestObject -Path $upstreamManifestPath
    if ($null -eq $upstreamManifest) { Write-Err 'upstream manifest has no fenced JSON block'; return 40 }

    $errs = Test-UpstreamManifest -Manifest $upstreamManifest
    if ($null -ne $errs) {
        $errs = @($errs)
        Write-Err 'upstream manifest invalid:'
        foreach ($e in $errs) { [Console]::Error.WriteLine("  $e") }
        return 40
    }

    foreach ($need in @('.github/agents', '.github/skills/dude-lint', '.github/instructions/dude.instructions.md', '.github/dudestuff/bundle-manifest.md')) {
        if (-not (Test-Path -LiteralPath (Join-Path $utree $need))) {
            Write-Err "upstream tree is missing required path: $need"
            return 40
        }
    }

    Invoke-ClassifyPlan -UpstreamTree $utree

    $upstreamSha = if ($upstreamManifest.PSObject.Properties.Name -contains 'installed_sha') { [string]$upstreamManifest.installed_sha } else { '' }
    if (-not $upstreamSha) { $upstreamSha = Get-TreeHeadSha -Dir $utree }
    $fromSha = $script:LOCAL_INSTALLED_SHA
    $createdAt = Get-IsoNow
    $stamp = Get-StampNow
    $planId = "$stamp-$(Get-ShortSha $fromSha)-$(Get-ShortSha $upstreamSha)"

    [void](New-Item -ItemType Directory -Force -Path $script:PLANS_DIR -ErrorAction SilentlyContinue)
    $planPath = Join-Path $script:PLANS_DIR "$planId.json"
    $ttlWarn = Get-IsoPlusSeconds 3600
    $ttlExpire = Get-IsoPlusSeconds 86400

    $planJson = Emit-PlanJson -PlanId $planId -FromSha $fromSha -ToSha $upstreamSha -CacheDir $utree `
        -CreatedAt $createdAt -TtlWarn $ttlWarn -TtlExpire $ttlExpire
    [System.IO.File]::WriteAllText($planPath, $planJson)

    if ($flags.Out) { Copy-Item -LiteralPath $planPath -Destination $flags.Out -Force }

    if ($flags.Format -eq 'json') {
        [Console]::Out.WriteLine($planJson)
    } else {
        Emit-PlanText -PlanId $planId -FromSha $fromSha -ToSha $upstreamSha -CacheDir $utree
        Write-Host ''
        Write-Host "Plan saved: $planPath"
    }

    $nWork = $script:CLS_REPLACE.Count + $script:CLS_ADD.Count + $script:CLS_REMOVE.Count
    if ($nWork -eq 0) { return 0 }
    return 10
}

function Invoke-Apply {
    param([string[]]$ArgList)
    $flags = Parse-ApplyFlags -ArgList $ArgList
    if ($null -eq $flags) { return 40 }

    if (-not (Test-GitWorkingTree)) { Write-Err $script:GIT_PREFLIGHT_REASON; return 40 }
    if ([string]::IsNullOrEmpty($flags.Plan))    { Write-Err '--plan is required (path or plan id)'; return 40 }
    if ([string]::IsNullOrEmpty($flags.Confirm)) { Write-Err "--confirm is required (use 'confirm-upgrade')"; return 40 }
    if ($flags.Confirm -ne 'confirm-upgrade')    { Write-Err "invalid --confirm token: $($flags.Confirm) (expected literal string 'confirm-upgrade')"; return 40 }

    if (-not (Test-LocalManifest)) { Write-Err "local bundle manifest missing or malformed: $($script:LOCAL_MANIFEST_PATH)"; return 40 }

    $planPath = Resolve-PlanPath -Arg $flags.Plan
    if (-not $planPath) { Write-Err "plan not found: $($flags.Plan)"; return 40 }
    $plan = Read-Plan -Path $planPath
    if ($null -eq $plan) { Write-Err "plan file malformed: $planPath"; return 40 }

    $planFromSha = if ($plan.PSObject.Properties.Name -contains 'from_sha')      { [string]$plan.from_sha }      else { '' }
    $planToSha   = if ($plan.PSObject.Properties.Name -contains 'to_sha')        { [string]$plan.to_sha }        else { '' }
    $planCache   = if ($plan.PSObject.Properties.Name -contains 'cache_dir')     { [string]$plan.cache_dir }     else { '' }
    $planSource  = if ($plan.PSObject.Properties.Name -contains 'source')        { [string]$plan.source }        else { '' }
    $planRef     = if ($plan.PSObject.Properties.Name -contains 'ref')           { [string]$plan.ref }           else { '' }
    $planId      = if ($plan.PSObject.Properties.Name -contains 'plan_id')       { [string]$plan.plan_id }       else { '' }
    $planCreated = if ($plan.PSObject.Properties.Name -contains 'created_at')    { [string]$plan.created_at }    else { '' }
    $planTtl     = if ($plan.PSObject.Properties.Name -contains 'ttl_expire_at') { [string]$plan.ttl_expire_at } else { '' }

    if ($planFromSha -ne $script:LOCAL_INSTALLED_SHA) {
        Write-Err "plan from_sha ($planFromSha) does not match local installed_sha ($($script:LOCAL_INSTALLED_SHA))"
        Write-Err "re-run 'plan' to generate a fresh plan"
        return 40
    }
    if (-not (Test-Path -LiteralPath $planCache -PathType Container)) {
        Write-Err "plan cache_dir missing: $planCache"
        Write-Err "the upstream tree may have been cleaned; re-run 'plan'"
        return 40
    }
    if ($planTtl) {
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $exp = ConvertFrom-IsoEpoch -Iso $planTtl
        if ($null -ne $exp -and $now -gt $exp) {
            Write-Err "plan expired (created $planCreated, expired $planTtl)"
            Write-Err "re-run 'plan' to generate a fresh plan"
            return 40
        }
    }
    if (-not $flags.AllowDirty -and (Get-GitDirty)) {
        Write-Err "working tree is dirty; commit/stash first, or pass --allow-dirty"
        return 40
    }

    $script:UPSTREAM_SOURCE = $planSource
    $script:UPSTREAM_REF    = $planRef
    Invoke-ClassifyPlan -UpstreamTree $planCache

    $upstreamManifestPath = Join-Path $planCache '.github/dudestuff/bundle-manifest.md'
    if (-not (Test-Path -LiteralPath $upstreamManifestPath -PathType Leaf)) {
        Write-Err "plan cache missing upstream manifest at $upstreamManifestPath"
        return 40
    }
    $nReplace = $script:CLS_REPLACE.Count
    $nAdd = $script:CLS_ADD.Count
    $nRemove = $script:CLS_REMOVE.Count
    if (($nReplace + $nAdd + $nRemove) -eq 0) {
        Write-Info "nothing to apply (no changes)"
        return 0
    }

    # ---- Safety net ----
    $safetyTag = "dude-pre-upgrade-$(Get-StampNow)"
    $upgradeBranch = "chore/dude-upgrade-$(Get-ShortSha $planToSha)"

    Write-Info "creating safety tag: $safetyTag"
    & git -C $script:ROOT tag $safetyTag 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "failed to create safety tag: $safetyTag"; return 40 }

    & git -C $script:ROOT show-ref --verify --quiet "refs/heads/$upgradeBranch" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $upgradeBranch = "$upgradeBranch-$(Get-StampNow)" }
    Write-Info "creating upgrade branch: $upgradeBranch"
    & git -C $script:ROOT checkout -b $upgradeBranch 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "failed to create upgrade branch: $upgradeBranch"
        & git -C $script:ROOT tag -d $safetyTag 2>$null | Out-Null
        return 40
    }

    $appliedPaths = New-Object System.Collections.Generic.List[string]
    $skippedRemoves = New-Object System.Collections.Generic.List[string]

    foreach ($p in $script:CLS_ADD) {
        $dest = Join-Path $script:ROOT $p
        [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) -ErrorAction SilentlyContinue)
        Copy-Item -LiteralPath (Join-Path $planCache $p) -Destination $dest -Force
        $appliedPaths.Add($p) | Out-Null
    }
    foreach ($r in $script:CLS_REPLACE) {
        $dest = Join-Path $script:ROOT $r.path
        [void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) -ErrorAction SilentlyContinue)
        Copy-Item -LiteralPath (Join-Path $planCache $r.path) -Destination $dest -Force
        $appliedPaths.Add($r.path) | Out-Null
    }
    if ($flags.SkipRemovals) {
        foreach ($p in $script:CLS_REMOVE) { $skippedRemoves.Add($p) | Out-Null }
    } else {
        foreach ($p in $script:CLS_REMOVE) {
            $target = Join-Path $script:ROOT $p
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
            $appliedPaths.Add($p) | Out-Null
        }
    }

    Write-LocalManifest -SourceRepo $planSource -SourceRef $planRef -InstalledSha $planToSha `
        -InstalledAt (Get-IsoNow)

    # Append upgrade-log entry with placeholder; patch lint later.
    $logPath = Join-Path $script:ROOT '.github/dudestuff/upgrade-log.md'
    $actualRemoved = $nRemove - $skippedRemoves.Count
    $logEntry = @"

## $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) — upgrade
- from: $planFromSha
- to:   $planToSha
- ref:  $planRef
- replaced: $nReplace
- added:    $nAdd
- removed:  $actualRemoved
- removals_deferred:   $($skippedRemoves.Count)
- preserved: project files outside the base namespace
- safety tag: $safetyTag
- lint: __LINT_RESULT__
- notes: plan_id=$planId; branch=$upgradeBranch
"@
    Add-Content -LiteralPath $logPath -Value $logEntry

    # Lint
    $lintResult = 'OK'
    $lintPath = Join-Path $script:ROOT '.github/skills/dude-lint/lint.sh'
    $lintPs1 = Join-Path $script:ROOT '.github/skills/dude-lint/lint.ps1'
    $ranLint = $false
    if (Test-Path -LiteralPath $lintPs1 -PathType Leaf) {
        & pwsh -NoLogo -NoProfile -File $lintPs1 *> $null
        $ranLint = $true
        if ($LASTEXITCODE -ne 0) { $lintResult = 'FAIL' }
    } elseif (Test-Path -LiteralPath $lintPath -PathType Leaf) {
        & bash $lintPath *> $null
        $ranLint = $true
        if ($LASTEXITCODE -ne 0) { $lintResult = 'FAIL' }
    }
    if (-not $ranLint) { $lintResult = 'SKIPPED' }

    # Patch placeholder.
    $logText = [System.IO.File]::ReadAllText($logPath)
    $logText = $logText -replace [regex]::Escape('__LINT_RESULT__'), "[$lintResult]"
    [System.IO.File]::WriteAllText($logPath, $logText)

    # Stage + commit.
    & git -C $script:ROOT add -A '.github/dudestuff/bundle-manifest.md' '.github/dudestuff/upgrade-log.md' 2>$null | Out-Null
    foreach ($p in $appliedPaths) {
        & git -C $script:ROOT add -A $p 2>$null | Out-Null
    }
    $commitMsg = "chore: upgrade Dude bundle to $(Get-ShortSha $planToSha)"
    & git -C $script:ROOT commit -q -m $commitMsg 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "git commit produced no changes or failed (manifest/log written; review with 'git status')"
    }

    if ($flags.Format -eq 'json') {
        Emit-ApplyJson $safetyTag $upgradeBranch $nReplace $nAdd $actualRemoved $skippedRemoves.Count $lintResult $planFromSha $planToSha
    } else {
        Emit-ApplyText $safetyTag $upgradeBranch $nReplace $nAdd $actualRemoved $skippedRemoves.Count $lintResult $planFromSha $planToSha
    }

    if ($lintResult -eq 'FAIL') {
        Write-Err "post-apply lint reported failures; review and consider 'rollback --tag $safetyTag'"
        return 40
    }
    return 0
}

function Invoke-Rollback {
    param([string[]]$ArgList)
    $flags = Parse-RollbackFlags -ArgList $ArgList
    if ($null -eq $flags) { return 40 }

    if (-not (Test-GitWorkingTree)) { Write-Err $script:GIT_PREFLIGHT_REASON; return 40 }
    if (-not $flags.AllowDirty -and (Get-GitDirty)) {
        Write-Err "working tree is dirty; commit/stash first, or pass --allow-dirty"
        return 40
    }

    $tag = $flags.Tag
    if (-not $tag) {
        $tags = & git -C $script:ROOT tag --list 'dude-pre-upgrade-*' --sort=-creatordate 2>$null
        $tags = @($tags) | Where-Object { $_ } | Select-Object -First 1
        $tag = if ($tags -is [array] -and $tags.Count -gt 0) { $tags[0] } else { [string]$tags }
        if (-not $tag) { Write-Err "no dude-pre-upgrade-* tag found; nothing to rollback to"; return 40 }
    }
    & git -C $script:ROOT rev-parse --verify $tag 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "tag not found: $tag"; return 40 }

    $restoredSha = & git -C $script:ROOT rev-parse $tag 2>$null
    $restoredSha = ([string]$restoredSha).Trim()
    $currentBranch = & git -C $script:ROOT rev-parse --abbrev-ref HEAD 2>$null
    $currentBranch = ([string]$currentBranch).Trim()

    Write-Info "resetting $currentBranch to safety tag: $tag ($(Get-ShortSha $restoredSha))"
    & git -C $script:ROOT reset --hard $tag 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "git reset --hard $tag failed"; return 40 }

    $logPath = Join-Path $script:ROOT '.github/dudestuff/upgrade-log.md'
    if (Test-Path -LiteralPath $logPath -PathType Leaf) {
        $entry = @"

## $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) — rollback
- restored: $restoredSha
- safety tag: $tag
- branch: $currentBranch
- notes: appended uncommitted; commit or discard as desired
"@
        Add-Content -LiteralPath $logPath -Value $entry
    }

    $lintResult = 'OK'
    $lintPs1 = Join-Path $script:ROOT '.github/skills/dude-lint/lint.ps1'
    $lintSh  = Join-Path $script:ROOT '.github/skills/dude-lint/lint.sh'
    if (Test-Path -LiteralPath $lintPs1 -PathType Leaf) {
        & pwsh -NoLogo -NoProfile -File $lintPs1 *> $null
        if ($LASTEXITCODE -ne 0) { $lintResult = 'FAIL' }
    } elseif (Test-Path -LiteralPath $lintSh -PathType Leaf) {
        & bash $lintSh *> $null
        if ($LASTEXITCODE -ne 0) { $lintResult = 'FAIL' }
    }

    if ($flags.Format -eq 'json') {
        $obj = [ordered]@{
            status       = 'rolled_back'
            tag          = $tag
            restored_sha = $restoredSha
            branch       = $currentBranch
            lint         = $lintResult
        }
        [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Depth 4))
    } else {
        Write-Host "Rolled back $currentBranch to $tag ($(Get-ShortSha $restoredSha))"
        Write-Host "Lint: [$lintResult]"
        Write-Host 'Note: rollback log entry appended uncommitted; review and commit if desired.'
    }
    return 0
}

# ----- main dispatch ---------------------------------------------------------

[void](New-Item -ItemType Directory -Force -Path $script:CACHE_ROOT -ErrorAction SilentlyContinue)

$argsArray = if ($null -ne $Rest) { @($Rest) } else { @() }

$exitCode = 0
switch ($Command) {
    'status'   { $exitCode = Invoke-Status   -ArgList $argsArray }
    'plan'     { $exitCode = Invoke-Plan     -ArgList $argsArray }
    'apply'    { $exitCode = Invoke-Apply    -ArgList $argsArray }
    'rollback' { $exitCode = Invoke-Rollback -ArgList $argsArray }
    'help'     { Show-Help;    $exitCode = 0 }
    'version'  { Show-Version; $exitCode = 0 }
    default    { Write-Err "unknown subcommand: $Command"; Show-Help; $exitCode = 40 }
}

exit $exitCode
