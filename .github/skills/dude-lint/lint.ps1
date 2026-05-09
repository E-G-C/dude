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
        # The negative lookbehind prevents durable task suffixes like
        # T001@a1b2c3d4 from being collected as role references.
        foreach ($m in [regex]::Matches($stripped, '(?<![A-Za-z0-9_])@([a-z][a-z0-9-]+)\b')) {
            $role = $m.Groups[1].Value.ToLower()
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
        if ($a.Name -in @('dude.agent.md', 'spec-lead.agent.md')) { continue }
        $rel = Get-RelativePath $a.FullName
        $content = Get-Content -LiteralPath $a.FullName -Encoding UTF8 -Raw
        if ($content -notmatch '\*\*Coordinator-only artifacts:\*\*') {
            Write-Fail "$rel  missing '**Coordinator-only artifacts:**' boundary block (see team-expansion template)"
        }
    }
}

# --- Summary -----------------------------------------------------------------
Write-Info "Scanned: $script:BrainstormCount brainstorm, $script:TaskFileCount task file(s), $script:MemoryFileCount memory file(s), $script:AgentCount agent(s)"
Write-Info "Findings: $script:WarnCount warning(s), $script:FailCount failure(s)"

if ($script:FailCount -gt 0) { exit 1 } else { exit 0 }
