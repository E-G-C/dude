#!/usr/bin/env bash
# Static linter for the Dude Coder bundle.
#
# Validates structural conventions across brainstorm/, specs/, and .github/.
# Read-only. No external dependencies beyond a POSIX shell + grep + awk.
# Mirror of lint.ps1.
#
# Usage:
#   bash .github/skills/dude-lint/lint.sh
#   bash .github/skills/dude-lint/lint.sh /path/to/repo
#
# Exit code: 0 if no failures, 1 if any [FAIL] was emitted.

set -u

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"

WARN_COUNT=0
FAIL_COUNT=0
BRAINSTORM_COUNT=0
TASKFILE_COUNT=0
MEMORYFILE_COUNT=0
AGENT_COUNT=0

if [ -t 1 ]; then
    YEL=$'\033[33m'
    RED=$'\033[31m'
    RST=$'\033[0m'
else
    YEL=""; RED=""; RST=""
fi

info() { printf '[INFO]  %s\n' "$1"; }
warn() { printf '%s[WARN]%s  %s\n' "$YEL" "$RST" "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }
fail() { printf '%s[FAIL]%s  %s\n' "$RED" "$RST" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

relpath() {
    # Strip $ROOT/ prefix from $1
    local path="$1"
    case "$path" in
        "$ROOT/"*) printf '%s\n' "${path#$ROOT/}" ;;
        "$ROOT")   printf '.\n' ;;
        *)         printf '%s\n' "$path" ;;
    esac
}

# read_frontmatter <file> <key>
# Returns the value of <key> in the YAML frontmatter, or empty string.
read_frontmatter() {
    awk -v key="$2" '
        BEGIN { in_fm=0; line=0 }
        {
            line++
            if (line == 1) {
                if ($0 == "---") { in_fm=1; next } else { exit }
            }
            if (in_fm == 1 && $0 == "---") { exit }
            if (in_fm == 1) {
                if (match($0, "^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:[ \t]*")) {
                    k = substr($0, 1, RLENGTH)
                    sub("[ \t]*:[ \t]*$", "", k)
                    if (k == key) {
                        v = substr($0, RLENGTH + 1)
                        sub("^[ \t]+", "", v)
                        sub("[ \t]+$", "", v)
                        print v
                        exit
                    }
                }
            }
        }
    ' "$1"
}

has_frontmatter() {
    awk '
        NR == 1 && $0 != "---" { exit }
        NR > 1 && $0 == "---" { found = 1; exit }
        END { if (found == 1) print "yes" }
    ' "$1"
}

# fence_order_errors <file> <start_re> <end_re>
# Walks the file in order and prints one human-readable error per defect:
#   - "duplicate start fence at line N while previous region (opened at line M) is still open"
#   - "end fence at line N with no matching start"
#   - "unclosed start fence opened at line M"
# Prints nothing if the fence sequence is well-ordered (start, end, start, end, ...).
fence_order_errors() {
    awk -v start_re="$2" -v end_re="$3" '
        BEGIN { depth = 0; open_line = 0 }
        {
            is_start = ($0 ~ start_re)
            is_end   = ($0 ~ end_re)
            # Lines that mention both (e.g. prose listing both fences in a code
            # span) are intentionally skipped to avoid false positives.
            if (is_start && is_end) next
            if (is_start) {
                if (depth > 0) {
                    printf "duplicate start fence at line %d while previous region (opened at line %d) is still open\n", NR, open_line
                } else {
                    depth = 1
                    open_line = NR
                }
            } else if (is_end) {
                if (depth == 0) {
                    printf "end fence at line %d with no matching start\n", NR
                } else {
                    depth = 0
                }
            }
        }
        END {
            if (depth > 0) {
                printf "unclosed start fence opened at line %d\n", open_line
            }
        }
    ' "$1"
}

info "Scanning .github + brainstorm + specs under $ROOT"

# --- Check 1: brainstorm files ----------------------------------------------
if [ -d "$ROOT/brainstorm" ]; then
    while IFS= read -r -d '' file; do
        BRAINSTORM_COUNT=$((BRAINSTORM_COUNT + 1))
        rel="$(relpath "$file")"

        if [ -z "$(has_frontmatter "$file")" ]; then
            fail "$rel  missing or malformed YAML frontmatter"
            continue
        fi

        status="$(read_frontmatter "$file" status)"
        spec_path="$(read_frontmatter "$file" spec_path)"

        if [ -z "$status" ]; then
            fail "$rel  frontmatter is missing 'status:'"
        elif [ "$status" != "draft" ] && [ "$status" != "defined" ]; then
            warn "$rel  unexpected status '$status' (valid: draft, defined)"
        elif [ "$status" = "defined" ]; then
            if [ -z "$spec_path" ]; then
                fail "$rel  status: defined but spec_path is missing"
            else
                # spec_path is a canonical identity string, so it must use
                # forward slashes exactly; later Beads matching is literal.
                if printf '%s' "$spec_path" | grep -q '\\' || ! printf '%s' "$spec_path" | grep -qE '^specs/[^/]+/spec\.md$'; then
                    fail "$rel  spec_path '$spec_path' must point at 'specs/<feature>/spec.md'"
                elif [ ! -e "$ROOT/$spec_path" ]; then
                    fail "$rel  spec_path '$spec_path' does not resolve to an existing file"
                elif [ -d "$ROOT/$spec_path" ]; then
                    fail "$rel  spec_path '$spec_path' resolves to a directory, not a file"
                fi
            fi
        fi

        m_start=$(grep -c '<!--[[:space:]]*dude:managed:start[[:space:]]*-->' "$file" || true)
        m_end=$(grep -c '<!--[[:space:]]*dude:managed:end[[:space:]]*-->' "$file" || true)
        if [ "$m_start" != "$m_end" ]; then
            fail "$rel  unbalanced managed fences ($m_start start / $m_end end)"
        else
            fence_errs="$(fence_order_errors "$file" '<!--[[:space:]]*dude:managed:start[[:space:]]*-->' '<!--[[:space:]]*dude:managed:end[[:space:]]*-->')"
            if [ -n "$fence_errs" ]; then
                while IFS= read -r err; do
                    [ -n "$err" ] && fail "$rel  managed fence: $err"
                done <<< "$fence_errs"
            fi
        fi

        has_log=$(grep -c '^##[[:space:]]\+Coordinator[[:space:]]\+Log\b' "$file" || true)
        has_legacy=$(grep -c '^##[[:space:]]\+Definition[[:space:]]\+Record\b' "$file" || true)
        if [ "$has_log" -eq 0 ] && [ "$has_legacy" -gt 0 ]; then
            warn "$rel  uses legacy '## Definition Record' heading; rename to '## Coordinator Log'"
        elif [ "$has_log" -eq 0 ] && [ "$has_legacy" -eq 0 ]; then
            warn "$rel  missing '## Coordinator Log' section"
        fi
    done < <(find "$ROOT/brainstorm" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)
fi

# --- Check 2: tasks files ---------------------------------------------------
# Use process substitution (not a pipe) so warn/fail counters in the parent
# shell are not lost in a subshell.
if [ -d "$ROOT/specs" ]; then
    while IFS= read -r -d '' file; do
        TASKFILE_COUNT=$((TASKFILE_COUNT + 1))
        rel="$(relpath "$file")"

        b_start=$(grep -c '<!--[[:space:]]*dude:board:start[[:space:]]*-->' "$file" || true)
        b_end=$(grep -c '<!--[[:space:]]*dude:board:end[[:space:]]*-->' "$file" || true)
        skip_board_region=1
        if [ "$b_start" != "$b_end" ]; then
            fail "$rel  unbalanced board fences ($b_start start / $b_end end)"
            skip_board_region=0
        elif [ "$b_start" -gt 1 ]; then
            fail "$rel  multiple board fence pairs found ($b_start); expected 0 or 1"
            skip_board_region=0
        else
            fence_errs="$(fence_order_errors "$file" '<!--[[:space:]]*dude:board:start[[:space:]]*-->' '<!--[[:space:]]*dude:board:end[[:space:]]*-->')"
            if [ -n "$fence_errs" ]; then
                while IFS= read -r err; do
                    [ -n "$err" ] && fail "$rel  board fence: $err"
                done <<< "$fence_errs"
                skip_board_region=0
            fi
        fi

        awk_out="$(awk -v rel="$rel" -v skip_board="$skip_board_region" '
            {
                line = NR

                if (skip_board == 1 && $0 ~ /^[[:space:]]*<!--[[:space:]]*dude:board:start[[:space:]]*-->[[:space:]]*$/) {
                    in_board = 1
                    next
                }
                if (in_board == 1) {
                    if ($0 ~ /^[[:space:]]*<!--[[:space:]]*dude:board:end[[:space:]]*-->[[:space:]]*$/) {
                        in_board = 0
                    }
                    next
                }
                if ($0 ~ /^##[[:space:]]+Lightweight[[:space:]]+Execution[[:space:]]+History([[:space:]]|$)/) {
                    in_history = 1
                    next
                }
                if (in_history == 1) {
                    next
                }

                if ($0 ~ /^[[:space:]]*-[[:space:]]*\[.\][[:space:]]+/) {
                    left = index($0, "[")
                    glyph = substr($0, left + 1, 1)
                    if (glyph != " " && glyph != "~" && glyph != "!" && glyph != "x") {
                        printf "FAIL\t%s:%d  invalid task glyph [%s] (valid: space, ~, !, x)\n", rel, line, glyph
                        next
                    }

                    if ($0 !~ /^- \[( |~|!|x)\] T[0-9][0-9][0-9]+(@[a-z0-9]{8})? (\[P\] )?\[(US[0-9]+|Shared)\] .+$/) {
                        printf "FAIL\t%s:%d  malformed task header (expected: - [ ] T001@a1b2c3d4 [P] [US1|Shared] Description)\n", rel, line
                        next
                    }

                    id = ""
                    if (match($0, "T[0-9][0-9][0-9]+(@[a-z0-9]{8})?")) {
                        id = substr($0, RSTART, RLENGTH)
                    }
                    if (id !~ /@[a-z0-9]{8}$/) {
                        printf "WARN\t%s:%d  legacy task ID %s (consider adding a durable @xxxxxxxx suffix)\n", rel, line, id
                    }
                    if (id in seen) {
                        printf "FAIL\t%s:%d  duplicate task ID %s (first seen line %d)\n", rel, line, id, seen[id]
                    } else {
                        seen[id] = line
                    }
                }
            }
        ' "$file")"

        if [ -n "$awk_out" ]; then
            while IFS= read -r out; do
                kind="${out%%$'\t'*}"
                msg="${out#*$'\t'}"
                case "$kind" in
                    FAIL) fail "$msg" ;;
                    WARN) warn "$msg" ;;
                esac
            done <<< "$awk_out"
        fi
    done < <(find "$ROOT/specs" -type f -name 'tasks.md' -print0 2>/dev/null)
fi

# --- Check 3: memory files --------------------------------------------------
if [ -d "$ROOT/.github/dudestuff" ]; then
    while IFS= read -r -d '' file; do
        MEMORYFILE_COUNT=$((MEMORYFILE_COUNT + 1))
        rel="$(relpath "$file")"
        bullets=$(grep -c '^- ' "$file" || true)
        if [ "$bullets" -gt 20 ]; then
            warn "$rel  $bullets entries (consider consolidation; memory-ledger threshold is 20)"
        fi
    done < <(find "$ROOT/.github/dudestuff" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)
fi

# --- Check 4: roster orphans ------------------------------------------------
# Use a colon-delimited string instead of an associative array so this script
# also runs under macOS's default Bash 3.2 (declare -A requires Bash 4+).
# Format: ":role1:role2:role3:" — wrap-with-colons so substring matches are
# whole-word.
VALID_ROLES=":dude:dude-lint:"

valid_role() {
    case "$VALID_ROLES" in
        *":$1:"*) return 0 ;;
        *)        return 1 ;;
    esac
}

if [ -d "$ROOT/.github/agents" ]; then
    while IFS= read -r -d '' file; do
        AGENT_COUNT=$((AGENT_COUNT + 1))
        base="$(basename "$file" .agent.md)"
        lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
        if ! valid_role "$lower"; then
            VALID_ROLES="${VALID_ROLES}${lower}:"
        fi
    done < <(find "$ROOT/.github/agents" -maxdepth 1 -type f -name '*.agent.md' -print0 2>/dev/null)
fi

if [ -d "$ROOT/.github" ]; then
    # Build a tab-separated list of "role<TAB>file" for unknown handles, then
    # aggregate in a single awk and feed back via a here-string so warn() runs
    # in the parent shell.
    raw_orphans=""
    while IFS= read -r -d '' file; do
        rel="$(relpath "$file")"
        content="$(awk '
            BEGIN { in_fence = 0 }
            {
                if ($0 ~ /^[[:space:]]*```/) { in_fence = 1 - in_fence; next }
                if (!in_fence) print
            }
        ' "$file")"
        # Match @<role> only when not preceded by alphanumeric (so durable task
        # ID suffixes like T001@a1b2c3d4 do not register as role refs).
        # POSIX ERE has no lookbehind; capture an optional leading boundary char
        # in the match and strip it in awk.
        tokens="$(printf '%s' "$content" | grep -oE '(^|[^[:alnum:]_])@[a-z][a-z0-9-]+' | awk '{ sub(/^[^@]*/, ""); print }' | sort -u || true)"
        if [ -n "$tokens" ]; then
            while IFS= read -r token; do
                role="${token#@}"
                if ! valid_role "$role"; then
                    raw_orphans="${raw_orphans}${role}"$'\t'"${rel}"$'\n'
                fi
            done <<< "$tokens"
        fi
    done < <(find "$ROOT/.github" -type f -name '*.md' -print0 2>/dev/null)

    if [ -n "$raw_orphans" ]; then
        aggregated="$(printf '%s' "$raw_orphans" | sort -u | awk -F'\t' '
            {
                role = $1; file = $2
                if (!(role in count)) {
                    count[role] = 1
                    first[role] = file
                } else {
                    count[role]++
                }
            }
            END {
                for (r in count) {
                    if (count[r] > 1) {
                        printf "orphan @%s reference in %s (+%d more)\n", r, first[r], count[r] - 1
                    } else {
                        printf "orphan @%s reference in %s\n", r, first[r]
                    }
                }
            }
        ' | sort)"
        if [ -n "$aggregated" ]; then
            while IFS= read -r msg; do
                fail "$msg"
            done <<< "$aggregated"
        fi
    fi
fi

# --- Check 5: coordinator-only block in non-dude / non-spec-lead agents ----
# Spec-lead is exempt because its own Rules + Workflow step 11 explicitly
# authorize it to maintain status:, spec_path:, and ## Coordinator Log.
if [ -d "$ROOT/.github/agents" ]; then
    while IFS= read -r -d '' file; do
        base="$(basename "$file")"
        case "$base" in
            dude.agent.md|spec-lead.agent.md) continue ;;
        esac
        rel="$(relpath "$file")"
        if ! grep -q '\*\*Coordinator-only artifacts:\*\*' "$file"; then
            fail "$rel  missing '**Coordinator-only artifacts:**' boundary block (see team-expansion template)"
        fi
    done < <(find "$ROOT/.github/agents" -maxdepth 1 -type f -name '*.agent.md' -print0 2>/dev/null)
fi

# --- Check 6: orphan skill references ---------------------------------------
# Scan all .github/**/*.md for path-form references like
# `.github/skills/<name>/` and fail when <name> does not resolve to an existing
# skill directory. Path-form is used (not backtick-name heuristics) because it
# gives high precision for a FAIL-emitting check.
VALID_SKILLS=":"
if [ -d "$ROOT/.github/skills" ]; then
    while IFS= read -r -d '' dir; do
        base="$(basename "$dir")"
        lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
        VALID_SKILLS="${VALID_SKILLS}${lower}:"
    done < <(find "$ROOT/.github/skills" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
fi

valid_skill() {
    case "$VALID_SKILLS" in
        *":$1:"*) return 0 ;;
        *)        return 1 ;;
    esac
}

if [ -d "$ROOT/.github" ]; then
    raw_skill_orphans=""
    while IFS= read -r -d '' file; do
        rel="$(relpath "$file")"
        # Strip fenced code blocks before scanning.
        content="$(awk '
            BEGIN { in_fence = 0 }
            {
                if ($0 ~ /^[[:space:]]*```/) { in_fence = 1 - in_fence; next }
                if (!in_fence) print
            }
        ' "$file")"
        tokens="$(printf '%s' "$content" | grep -oE '\.github/skills/[a-z][a-z0-9-]+' | awk '{ sub(/^.*\//, ""); print }' | sort -u || true)"
        if [ -n "$tokens" ]; then
            while IFS= read -r name; do
                [ -z "$name" ] && continue
                if ! valid_skill "$name"; then
                    raw_skill_orphans="${raw_skill_orphans}${name}"$'\t'"${rel}"$'\n'
                fi
            done <<< "$tokens"
        fi
    done < <(find "$ROOT/.github" -type f -name '*.md' -print0 2>/dev/null)

    if [ -n "$raw_skill_orphans" ]; then
        aggregated="$(printf '%s' "$raw_skill_orphans" | sort -u | awk -F'\t' '
            {
                name = $1; file = $2
                if (!(name in count)) {
                    count[name] = 1
                    first[name] = file
                } else {
                    count[name]++
                }
            }
            END {
                for (n in count) {
                    if (count[n] > 1) {
                        printf "orphan skill reference .github/skills/%s/ in %s (+%d more)\n", n, first[n], count[n] - 1
                    } else {
                        printf "orphan skill reference .github/skills/%s/ in %s\n", n, first[n]
                    }
                }
            }
        ' | sort)"
        if [ -n "$aggregated" ]; then
            while IFS= read -r msg; do
                fail "$msg"
            done <<< "$aggregated"
        fi
    fi
fi

# --- Summary -----------------------------------------------------------------
info "Scanned: $BRAINSTORM_COUNT brainstorm, $TASKFILE_COUNT task file(s), $MEMORYFILE_COUNT memory file(s), $AGENT_COUNT agent(s)"
info "Findings: $WARN_COUNT warning(s), $FAIL_COUNT failure(s)"

if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi
exit 0
