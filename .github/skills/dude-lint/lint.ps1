#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Static linter for the Dude Coder bundle.

.DESCRIPTION
    Validates structural conventions across brainstorm/, specs/, and .github/.
    Read-only. No external dependencies. Mirror of lint.sh.

.PARAMETER Root
    Repository root to scan. Defaults to current directory.

.EXAMPLE
    pwsh .github/skills/dude-lint/lint.ps1
    pwsh .github/skills/dude-lint/lint.ps1 -Root C:\Work\AI\dude
#>

[CmdletBinding()]
param(
    [string]$Root = "."
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path -LiteralPath $Root).Path

$script:WarnCount = 0
$script:FailCount = 0
$script:BrainstormCount = 0
$script:TaskFileCount = 0
$script:MemoryFileCount = 0
$script:AgentCount = 0

function Write-Info($msg) { Write-Host "[INFO]  $msg" }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow; $script:WarnCount++ }
function Write-Fail($msg) { Write-Host "[FAIL]  $msg" -ForegroundColor Red; $script:FailCount++ }

function Get-RelativePath($absolute) {
    $rel = $absolute.Substring($Root.Length).TrimStart('\', '/')
    return $rel -replace '\\', '/'
}

# Walk fence pairs in order. Returns @() if balanced and well-ordered, or
# an array of human-readable error strings (each describing one defect) so
# the caller can attribute them to a specific file.
#
# A well-ordered fence sequence is: start, end, start, end, ...
# Errors detected:
#   - end fence with no matching start (e.g. end-before-start)
#   - new start fence while still inside an open region
#   - start fence with no matching end (unclosed at EOF)
function Test-FenceOrder($lines, $startPattern, $endPattern) {
    $errors = @()
    $depth = 0
    $openLine = 0
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $ln = $lines[$i]
        $isStart = $ln -match $startPattern
        $isEnd = $ln -match $endPattern
        if ($isStart -and $isEnd) { continue } # mention in prose, ignore
        if ($isStart) {
            if ($depth -gt 0) {
                $errors += "duplicate start fence at line $($i + 1) while previous region (opened at line $openLine) is still open"
            }
            else {
                $depth = 1
                $openLine = $i + 1
            }
        }
        elseif ($isEnd) {
            if ($depth -eq 0) {
                $errors += "end fence at line $($i + 1) with no matching start"
            }
            else {
                $depth = 0
            }
        }
    }
    if ($depth -gt 0) {
        $errors += "unclosed start fence opened at line $openLine"
    }
    return ,$errors
}

function Get-Frontmatter($lines) {
    if ($lines.Count -lt 2 -or $lines[0].Trim() -ne '---') { return $null }
    $end = -1
    for ($i = 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq '---') { $end = $i; break }
    }
    if ($end -lt 0) { return $null }
    $fm = @{}
    for ($i = 1; $i -lt $end; $i++) {
        if ($lines[$i] -match '^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$') {
            $fm[$matches[1]] = $matches[2].Trim()
        }
    }
    return $fm
}

function Normalize-FrontmatterScalar($value) {
    $text = ([string]$value).Trim()
    if ($text.Length -ge 2) {
        $first = $text[0]
        $last = $text[$text.Length - 1]
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
            return $text.Substring(1, $text.Length - 2)
        }
    }
    return $text
}

Write-Info "Scanning .github + brainstorm + specs under $Root"

# --- Check 1: brainstorm files ----------------------------------------------
$brainstormDir = Join-Path $Root "brainstorm"
if (Test-Path -LiteralPath $brainstormDir) {
    $brainstorms = Get-ChildItem -LiteralPath $brainstormDir -Filter *.md -File -ErrorAction SilentlyContinue
    foreach ($file in $brainstorms) {
        $script:BrainstormCount++
        $rel = Get-RelativePath $file.FullName
        $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
        $fm = Get-Frontmatter $lines

        if ($null -eq $fm) {
            Write-Fail "$rel  missing or malformed YAML frontmatter"
            continue
        }

        $status = $fm['status']
        $specPath = $fm['spec_path']

        if ([string]::IsNullOrEmpty($status)) {
            Write-Fail "$rel  frontmatter is missing 'status:'"
        }
        elseif ($status -notin @('draft', 'defined')) {
            Write-Warn "$rel  unexpected status '$status' (valid: draft, defined)"
        }
        elseif ($status -eq 'defined') {
            if ([string]::IsNullOrEmpty($specPath)) {
                Write-Fail "$rel  status: defined but spec_path is missing"
            }
            else {
                # spec_path is a canonical identity string, so it must use
                # forward slashes exactly; later Beads matching is literal.
                if ($specPath -match '\\' -or $specPath -notmatch '^specs/[^/]+/spec\.md$') {
                    Write-Fail "$rel  spec_path '$specPath' must point at 'specs/<feature>/spec.md'"
                }
                else {
                    $resolved = Join-Path $Root $specPath
                    if (-not (Test-Path -LiteralPath $resolved)) {
                        Write-Fail "$rel  spec_path '$specPath' does not resolve to an existing file"
                    }
                    elseif ((Get-Item -LiteralPath $resolved -ErrorAction SilentlyContinue).PSIsContainer) {
                        Write-Fail "$rel  spec_path '$specPath' resolves to a directory, not a file"
                    }
                }
            }
        }

        $body = ($lines -join "`n")
        $managedStart = ([regex]::Matches($body, '<!--\s*dude:managed:start\s*-->')).Count
        $managedEnd = ([regex]::Matches($body, '<!--\s*dude:managed:end\s*-->')).Count
        if ($managedStart -ne $managedEnd) {
            Write-Fail "$rel  unbalanced managed fences ($managedStart start / $managedEnd end)"
        }
        else {
            $fenceErrors = Test-FenceOrder $lines '<!--\s*dude:managed:start\s*-->' '<!--\s*dude:managed:end\s*-->'
            foreach ($err in $fenceErrors) {
                Write-Fail "$rel  managed fence: $err"
            }
        }

        $hasCoordLog = $body -match '(?m)^##\s+Coordinator\s+Log\b'
        $hasDefRecord = $body -match '(?m)^##\s+Definition\s+Record\b'
        if (-not $hasCoordLog -and $hasDefRecord) {
            Write-Warn "$rel  uses legacy '## Definition Record' heading; rename to '## Coordinator Log'"
        }
        elseif (-not $hasCoordLog -and -not $hasDefRecord) {
            Write-Warn "$rel  missing '## Coordinator Log' section"
        }
    }
}

# --- Check 2: tasks files ---------------------------------------------------
$specsDir = Join-Path $Root "specs"
if (Test-Path -LiteralPath $specsDir) {
    $taskFiles = Get-ChildItem -LiteralPath $specsDir -Recurse -Filter tasks.md -File -ErrorAction SilentlyContinue
    foreach ($file in $taskFiles) {
        $script:TaskFileCount++
        $rel = Get-RelativePath $file.FullName
        $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
        $body = ($lines -join "`n")

        $boardStart = ([regex]::Matches($body, '<!--\s*dude:board:start\s*-->')).Count
        $boardEnd = ([regex]::Matches($body, '<!--\s*dude:board:end\s*-->')).Count
        $boardOrderOk = $true
        if ($boardStart -ne $boardEnd) {
            Write-Fail "$rel  unbalanced board fences ($boardStart start / $boardEnd end)"
            $boardOrderOk = $false
        }
        elseif ($boardStart -gt 1) {
            Write-Fail "$rel  multiple board fence pairs found ($boardStart); expected 0 or 1"
            $boardOrderOk = $false
        }
        else {
            $fenceErrors = Test-FenceOrder $lines '<!--\s*dude:board:start\s*-->' '<!--\s*dude:board:end\s*-->'
            foreach ($err in $fenceErrors) {
                Write-Fail "$rel  board fence: $err"
                $boardOrderOk = $false
            }
        }

        # If board fences are misordered, do not enter board-skip mode during
        # the task scan; otherwise the trailing 'start' would silently swallow
        # the rest of the file and hide malformed task rows.
        $skipBoardRegion = $boardOrderOk

        $seenIds = @{}
        $inBoard = $false
        $inHistory = $false
        $taskLinePattern = '^\s*-\s*\[(.)\]\s+'
        $canonicalTaskPattern = '^- \[( |~|!|x)\] (T\d{3,}(?:@[a-z0-9]{8})?) (\[P\] )?\[(US\d+|Shared)\] (.+)$'

        for ($i = 0; $i -lt $lines.Count; $i++) {
            $ln = $lines[$i]
            $lineNo = $i + 1

            if ($skipBoardRegion -and $ln -match '^\s*<!--\s*dude:board:start\s*-->\s*$') {
                $inBoard = $true
                continue
            }
            if ($inBoard) {
                if ($ln -match '^\s*<!--\s*dude:board:end\s*-->\s*$') { $inBoard = $false }
                continue
            }
            if ($ln -match '^##\s+Lightweight\s+Execution\s+History\b') {
                $inHistory = $true
                continue
            }
            if ($inHistory) { continue }

            if ($ln -match $taskLinePattern) {
                $glyph = $matches[1]

                if ($glyph -notin @(' ', '~', '!', 'x')) {
                    Write-Fail "${rel}:${lineNo}  invalid task glyph '[$glyph]' (valid: ' ', '~', '!', 'x')"
                    continue
                }

                if ($ln -cmatch $canonicalTaskPattern) {
                    $id = $matches[2]
                }
                else {
                    Write-Fail "${rel}:${lineNo}  malformed task header (expected: - [ ] T001@a1b2c3d4 [P] [US1|Shared] Description)"
                    continue
                }

                if ($id -notmatch '@[a-z0-9]{8}$') {
                    Write-Warn "${rel}:${lineNo}  legacy task ID '$id' (consider adding a durable @xxxxxxxx suffix)"
                }

                if ($seenIds.ContainsKey($id)) {
                    Write-Fail "${rel}:${lineNo}  duplicate task ID '$id' (first seen line $($seenIds[$id]))"
                }
                else {
                    $seenIds[$id] = $lineNo
                }
            }
        }
    }
}

# --- Check 3: memory files --------------------------------------------------
$memDir = Join-Path $Root ".github/dudestuff"
if (Test-Path -LiteralPath $memDir) {
    $memFiles = Get-ChildItem -LiteralPath $memDir -Filter *.md -File -ErrorAction SilentlyContinue
    foreach ($file in $memFiles) {
        $script:MemoryFileCount++
        $rel = Get-RelativePath $file.FullName
        $lines = Get-Content -LiteralPath $file.FullName -Encoding UTF8
        $bullets = ($lines | Where-Object { $_ -match '^- ' }).Count
        if ($bullets -gt 20) {
            Write-Warn "$rel  $bullets entries (consider consolidation; memory-ledger threshold is 20)"
        }
    }
}

# --- Check 3a: skill frontmatter names --------------------------------------
$skillsRootForNames = Join-Path $Root ".github/skills"
if (Test-Path -LiteralPath $skillsRootForNames) {
    foreach ($dir in (Get-ChildItem -LiteralPath $skillsRootForNames -Directory -ErrorAction SilentlyContinue)) {
        $skillFile = Join-Path $dir.FullName "SKILL.md"
        if (-not (Test-Path -LiteralPath $skillFile)) {
            Write-Fail "$(Get-RelativePath $dir.FullName)  missing SKILL.md"
            continue
        }

        $rel = Get-RelativePath $skillFile
        $lines = Get-Content -LiteralPath $skillFile -Encoding UTF8
        $fm = Get-Frontmatter $lines
        if ($null -eq $fm) {
            Write-Fail "$rel  missing or malformed YAML frontmatter"
            continue
        }

        if (-not $fm.ContainsKey('name')) {
            Write-Fail "$rel  frontmatter is missing 'name:'"
            continue
        }

        $name = Normalize-FrontmatterScalar $fm['name']
        if ($name -ne $dir.Name) {
            Write-Fail "$rel  frontmatter name '$name' must match directory '$($dir.Name)'"
        }
    }
}

# --- Check 3b: bundle manifest ---------------------------------------------
$manifestPath = Join-Path $Root ".github/dudestuff/bundle-manifest.md"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    Write-Fail ".github/dudestuff/bundle-manifest.md  missing seeded bundle manifest"
}
else {
    $manifestRel = Get-RelativePath $manifestPath
    $manifestRaw = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw
    $manifestMatch = [regex]::Match($manifestRaw, '(?s)```json\s*(\{.*?\})\s*```')
    if (-not $manifestMatch.Success) {
        Write-Fail "$manifestRel  missing fenced JSON manifest block"
    }
    else {
        try {
            $manifest = $manifestMatch.Groups[1].Value | ConvertFrom-Json
            foreach ($field in @('source_repo', 'source_ref', 'installed_sha', 'installed_at', 'files')) {
                if (-not ($manifest.PSObject.Properties.Name -contains $field)) {
                    Write-Fail "$manifestRel  manifest is missing '$field'"
                }
            }

            $installedSha = [string]$manifest.installed_sha
            if ($installedSha -notmatch '^[0-9a-f]{40}$') {
                Write-Fail "$manifestRel  installed_sha must be a 40-character lowercase git sha"
            }

            $fileEntries = @()
            if ($null -ne $manifest.files) {
                $fileEntries = @($manifest.files.PSObject.Properties)
            }
            if ($fileEntries.Count -eq 0) {
                Write-Fail "$manifestRel  files map must be seeded and non-empty"
            }

            $overrideByPath = @{}
            $overrideEntries = @()
            if (($manifest.PSObject.Properties.Name -contains 'local_overrides') -and $null -ne $manifest.local_overrides) {
                $overrideEntries = @($manifest.local_overrides.PSObject.Properties)
                foreach ($override in $overrideEntries) {
                    $overrideByPath[[string]$override.Name] = $override.Value
                }
            }

            $expectedHashes = @{}
            $actualHashes = @{}

            foreach ($entry in $fileEntries) {
                $path = [string]$entry.Name
                $expectedHash = [string]$entry.Value
                if ([string]::IsNullOrWhiteSpace($path) -or $path -match '\\' -or $path -match '^/' -or $path -match '(^|/)\.\.(/|$)') {
                    Write-Fail "$manifestRel  invalid manifest path '$path'"
                    continue
                }
                $isReservedLocalPath = (
                    $path -match '^\.github/agents/dude-local-[^/]+\.agent\.md$' -or
                    $path -match '^\.github/skills/dude-local-[^/]+/.+$'
                )
                if ($isReservedLocalPath) {
                    Write-Fail "$manifestRel  manifest path '$path' uses the reserved project-local namespace"
                    continue
                }
                $isCorePath = (
                    $path -eq '.github/agents/dude.agent.md' -or
                    $path -match '^\.github/agents/dude-[^/]+\.agent\.md$' -or
                    $path -match '^\.github/skills/dude-[^/]+/.+$' -or
                    $path -eq '.github/instructions/dude.instructions.md'
                )
                if (-not $isCorePath) {
                    Write-Fail "$manifestRel  manifest path '$path' is outside the dude- core namespace"
                    continue
                }
                if ($expectedHash -notmatch '^[0-9a-f]{64}$') {
                    Write-Fail "$manifestRel  invalid SHA-256 for '$path'"
                    continue
                }
                $expectedHashes[$path] = $expectedHash
                $resolvedPath = Join-Path $Root ($path -replace '/', [IO.Path]::DirectorySeparatorChar)
                if (-not (Test-Path -LiteralPath $resolvedPath)) {
                    Write-Fail "$manifestRel  manifest file '$path' does not exist"
                    continue
                }
                if ((Get-Item -LiteralPath $resolvedPath).PSIsContainer) {
                    Write-Fail "$manifestRel  manifest path '$path' resolves to a directory"
                    continue
                }
                $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedPath).Hash.ToLowerInvariant()
                $actualHashes[$path] = $actualHash
                if ($actualHash -ne $expectedHash) {
                    $hasAcceptedOverride = $false
                    if ($overrideByPath.ContainsKey($path)) {
                        $overrideValue = $overrideByPath[$path]
                        $overrideBaseHash = [string]$overrideValue.base_sha256
                        $overrideCurrentHash = [string]$overrideValue.current_sha256
                        if ($overrideBaseHash -eq $expectedHash -and $overrideCurrentHash -eq $actualHash) {
                            $hasAcceptedOverride = $true
                        }
                    }
                    if (-not $hasAcceptedOverride) {
                        Write-Fail "$manifestRel  manifest hash mismatch for '$path'"
                    }
                }
            }

            foreach ($override in $overrideEntries) {
                $path = [string]$override.Name
                $overrideValue = $override.Value
                if ([string]::IsNullOrWhiteSpace($path) -or $path -match '\\' -or $path -match '^/' -or $path -match '(^|/)\.\.(/|$)') {
                    Write-Fail "$manifestRel  invalid local override path '$path'"
                    continue
                }
                if (-not $expectedHashes.ContainsKey($path)) {
                    Write-Fail "$manifestRel  local override '$path' is not listed in files"
                    continue
                }
                foreach ($field in @('base_sha256', 'current_sha256', 'reason', 'accepted_at')) {
                    if (-not ($overrideValue.PSObject.Properties.Name -contains $field)) {
                        Write-Fail "$manifestRel  local override '$path' is missing '$field'"
                    }
                }
                $baseHash = [string]$overrideValue.base_sha256
                $currentHash = [string]$overrideValue.current_sha256
                if ($baseHash -notmatch '^[0-9a-f]{64}$') {
                    Write-Fail "$manifestRel  local override '$path' has invalid base_sha256"
                    continue
                }
                if ($currentHash -notmatch '^[0-9a-f]{64}$') {
                    Write-Fail "$manifestRel  local override '$path' has invalid current_sha256"
                    continue
                }
                if ($baseHash -ne $expectedHashes[$path]) {
                    Write-Fail "$manifestRel  local override '$path' base_sha256 does not match files entry"
                    continue
                }
                if ($actualHashes.ContainsKey($path) -and $currentHash -ne $actualHashes[$path]) {
                    Write-Fail "$manifestRel  local override '$path' current_sha256 does not match the current file"
                    continue
                }
                if ($currentHash -ne $baseHash) {
                    Write-Warn "$manifestRel  accepted local override for '$path' (hash differs from base)"
                }
            }
        }
        catch {
            Write-Fail "$manifestRel  manifest JSON failed to parse: $($_.Exception.Message)"
        }
    }
}

# --- Check 3b: project-local namespace advisories ---------------------------
# Collect manifest paths (best effort) so unprefixed on-disk artifacts that are
# already core-owned do not double-warn. Errors here are advisory only.
$manifestPaths = @{}
if (Test-Path -LiteralPath $manifestPath) {
    try {
        $mraw = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw
        $mm = [regex]::Match($mraw, '(?s)```json\s*(\{.*?\})\s*```')
        if ($mm.Success) {
            $mj = $mm.Groups[1].Value | ConvertFrom-Json
            if ($null -ne $mj.files) {
                foreach ($p in $mj.files.PSObject.Properties.Name) { $manifestPaths[$p] = $true }
            }
        }
    } catch {}
}

$agentDirAdv = Join-Path $Root ".github/agents"
if (Test-Path -LiteralPath $agentDirAdv) {
    foreach ($a in (Get-ChildItem -LiteralPath $agentDirAdv -Filter *.agent.md -File -ErrorAction SilentlyContinue)) {
        $rel = (Get-RelativePath $a.FullName) -replace '\\', '/'
        if ($manifestPaths.ContainsKey($rel)) { continue }
        if ($a.Name -eq 'dude.agent.md') { continue }
        if ($a.Name -like 'dude-local-*') { continue }
        Write-Warn "$rel  unreserved project-owned agent (rename to .github/agents/dude-local-<slug>.agent.md to avoid future upstream collisions)"
    }
}

$skillDirAdv = Join-Path $Root ".github/skills"
if (Test-Path -LiteralPath $skillDirAdv) {
    foreach ($d in (Get-ChildItem -LiteralPath $skillDirAdv -Directory -ErrorAction SilentlyContinue)) {
        $name = $d.Name
        if ($name -eq 'project') { continue }
        if ($name -like 'dude-local-*') { continue }
        $relDir = ".github/skills/$name/"
        $hasManifestEntry = $false
        foreach ($k in $manifestPaths.Keys) { if ($k.StartsWith($relDir)) { $hasManifestEntry = $true; break } }
        if ($hasManifestEntry) { continue }
        Write-Warn "$relDir  unreserved project-owned skill (rename to .github/skills/dude-local-<slug>/ to avoid future upstream collisions)"
    }
}

# --- Check 4: roster orphans ------------------------------------------------
$agentDir = Join-Path $Root ".github/agents"
$validRoles = New-Object System.Collections.Generic.HashSet[string]
[void]$validRoles.Add('dude')
[void]$validRoles.Add('dude-lint')

if (Test-Path -LiteralPath $agentDir) {
    $agents = Get-ChildItem -LiteralPath $agentDir -Filter *.agent.md -File -ErrorAction SilentlyContinue
    foreach ($a in $agents) {
        $script:AgentCount++
        $name = $a.Name -replace '\.agent\.md$', ''
        [void]$validRoles.Add($name.ToLower())
    }
}

$githubDir = Join-Path $Root ".github"
if (Test-Path -LiteralPath $githubDir) {
    $allMd = Get-ChildItem -LiteralPath $githubDir -Recurse -Filter *.md -File -ErrorAction SilentlyContinue
    $referenced = @{}
    foreach ($file in $allMd) {
        $content = Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Raw
        # Strip fenced code blocks to reduce noise.
        $stripped = [regex]::Replace($content, '(?s)```.*?```', '')
        # Strip documentation placeholders like `<slug>` and the optional `-`
        # immediately preceding them (e.g. `@dude-local-<slug>`).
        $stripped = [regex]::Replace($stripped, '-?<[a-zA-Z][a-zA-Z0-9_-]*>', '')
        # The negative lookbehind prevents durable task suffixes like
        # T001@a1b2c3d4 from being collected as role references.
        foreach ($m in [regex]::Matches($stripped, '(?<![A-Za-z0-9_])@([a-z][a-z0-9-]+)\b')) {
            $role = $m.Groups[1].Value.ToLower()
            # Documentation placeholders such as @dude-local-<slug> collapse to
            # @dude-local after placeholder stripping; real dude-local handles
            # must still resolve to agent files.
            if ($role -eq 'dude-local') { continue }
            if (-not $validRoles.Contains($role)) {
                if (-not $referenced.ContainsKey($role)) { $referenced[$role] = @() }
                $referenced[$role] += (Get-RelativePath $file.FullName)
            }
        }
    }
    foreach ($role in ($referenced.Keys | Sort-Object)) {
        $files = $referenced[$role] | Select-Object -Unique
        $first = $files | Select-Object -First 1
        $extra = if ($files.Count -gt 1) { " (+$($files.Count - 1) more)" } else { "" }
        Write-Fail "orphan @${role} reference in ${first}${extra}"
    }
}

# --- Check 5: coordinator-only block in non-dude / non-spec-lead agents ----
# Spec-lead is exempt because its own Rules + Workflow step 11 explicitly
# authorize it to maintain status:, spec_path:, and ## Coordinator Log.
if (Test-Path -LiteralPath $agentDir) {
    $agents = Get-ChildItem -LiteralPath $agentDir -Filter *.agent.md -File -ErrorAction SilentlyContinue
    foreach ($a in $agents) {
        if ($a.Name -in @('dude.agent.md', 'dude-spec-lead.agent.md')) { continue }
        $rel = Get-RelativePath $a.FullName
        $content = Get-Content -LiteralPath $a.FullName -Encoding UTF8 -Raw
        if ($content -notmatch '\*\*Coordinator-only artifacts:\*\*') {
            Write-Fail "$rel  missing '**Coordinator-only artifacts:**' boundary block (see team-expansion template)"
        }
    }
}

# --- Check 6: orphan skill references ---------------------------------------
# Scan all .github/**/*.md for path-form references like `.github/skills/<name>/`
# or `.github/skills/<name>/SKILL.md` and fail when <name> does not resolve to
# an existing skill directory. Path-form is used (not backtick-name heuristics)
# because it gives high precision for a FAIL-emitting check.
$skillsDir = Join-Path $Root ".github/skills"
$validSkills = New-Object System.Collections.Generic.HashSet[string]
if (Test-Path -LiteralPath $skillsDir) {
    Get-ChildItem -LiteralPath $skillsDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        [void]$validSkills.Add($_.Name.ToLower())
    }
}

if (Test-Path -LiteralPath $githubDir) {
    $skillRefs = @{}
    $allMd2 = Get-ChildItem -LiteralPath $githubDir -Recurse -Filter *.md -File -ErrorAction SilentlyContinue
    foreach ($file in $allMd2) {
        $content = Get-Content -LiteralPath $file.FullName -Encoding UTF8 -Raw
        # Strip fenced code blocks; example/illustrative paths inside fences
        # often reference hypothetical skills.
        $stripped = [regex]::Replace($content, '(?s)```.*?```', '')
        # Strip documentation placeholders like `<slug>` and the optional `-`
        # preceding them so paths like `.github/skills/dude-local-<slug>/` do
        # not get treated as orphan references.
        $stripped = [regex]::Replace($stripped, '-?<[a-zA-Z][a-zA-Z0-9_-]*>', '')
        foreach ($m in [regex]::Matches($stripped, '\.github/skills/([a-z][a-z0-9-]+)(?:/|\b)')) {
            $name = $m.Groups[1].Value.ToLower()
            # Documentation placeholders such as .github/skills/dude-local-<slug>/
            # collapse to dude-local after placeholder stripping; real
            # dude-local skill paths must still resolve to skill directories.
            if ($name -eq 'dude-local') { continue }
            if (-not $validSkills.Contains($name)) {
                if (-not $skillRefs.ContainsKey($name)) { $skillRefs[$name] = @() }
                $skillRefs[$name] += (Get-RelativePath $file.FullName)
            }
        }
    }
    foreach ($name in ($skillRefs.Keys | Sort-Object)) {
        $files = $skillRefs[$name] | Select-Object -Unique
        $first = $files | Select-Object -First 1
        $extra = if ($files.Count -gt 1) { " (+$($files.Count - 1) more)" } else { "" }
        Write-Fail "orphan skill reference '.github/skills/${name}/' in ${first}${extra}"
    }
}

# --- Summary -----------------------------------------------------------------
Write-Info "Scanned: $script:BrainstormCount brainstorm, $script:TaskFileCount task file(s), $script:MemoryFileCount memory file(s), $script:AgentCount agent(s)"
Write-Info "Findings: $script:WarnCount warning(s), $script:FailCount failure(s)"

if ($script:FailCount -gt 0) { exit 1 } else { exit 0 }
