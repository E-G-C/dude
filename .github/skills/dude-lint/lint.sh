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

unquote_frontmatter_scalar() {
    local value="$1"
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf '%s\n' "$value"
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

# --- Check 3a: skill frontmatter names --------------------------------------
if [ -d "$ROOT/.github/skills" ]; then
    while IFS= read -r -d '' dir; do
        base="$(basename "$dir")"
        skill_file="$dir/SKILL.md"
        if [ ! -f "$skill_file" ]; then
            fail "$(relpath "$dir")  missing SKILL.md"
            continue
        fi

        rel="$(relpath "$skill_file")"
        if [ -z "$(has_frontmatter "$skill_file")" ]; then
            fail "$rel  missing or malformed YAML frontmatter"
            continue
        fi

        skill_name="$(unquote_frontmatter_scalar "$(read_frontmatter "$skill_file" name)")"
        if [ -z "$skill_name" ]; then
            fail "$rel  frontmatter is missing 'name:'"
        elif [ "$skill_name" != "$base" ]; then
            fail "$rel  frontmatter name '$skill_name' must match directory '$base'"
        fi
    done < <(find "$ROOT/.github/skills" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
fi

# --- Check 3b: bundle manifest ---------------------------------------------
MANIFEST="$ROOT/.github/dudestuff/bundle-manifest.md"

file_sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{ print tolower($1) }'
    else
        shasum -a 256 "$1" | awk '{ print tolower($1) }'
    fi
}

if [ ! -f "$MANIFEST" ]; then
    fail ".github/dudestuff/bundle-manifest.md  missing seeded bundle manifest"
else
    manifest_rel="$(relpath "$MANIFEST")"
    manifest_json="$(awk '
        BEGIN { in_json = 0 }
        /^```json[[:space:]]*$/ { in_json = 1; next }
        /^```[[:space:]]*$/ && in_json == 1 { exit }
        in_json == 1 { print }
    ' "$MANIFEST")"

    if [ -z "$manifest_json" ]; then
        fail "$manifest_rel  missing fenced JSON manifest block"
    else
        manifest_syntax_errors="$(printf '%s\n' "$manifest_json" | awk '
            BEGIN { state = 0; file_count = 0; override_count = 0; prev_file_no_comma = 0; prev_file_had_comma = 0 }
            /^[[:space:]]*$/ { next }
            state == 0 {
                if ($0 ~ /^[[:space:]]*\{[[:space:]]*$/) { state = 1; next }
                printf "manifest JSON must start with an object at line %d\n", NR; state = 99; next
            }
            state == 1 {
                if ($0 ~ /^[[:space:]]*"(source_repo|source_ref|installed_sha|installed_at|bundle_version)"[[:space:]]*:[[:space:]]*"[^"]*"[[:space:]]*,[[:space:]]*$/) { next }
                if ($0 ~ /^[[:space:]]*"files"[[:space:]]*:[[:space:]]*\{[[:space:]]*$/) { state = 2; next }
                if ($0 ~ /^[[:space:]]*"local_overrides"[[:space:]]*:[[:space:]]*\{[[:space:]]*\}[[:space:]]*,?[[:space:]]*$/) { next }
                if ($0 ~ /^[[:space:]]*"local_overrides"[[:space:]]*:[[:space:]]*\{[[:space:]]*$/) { state = 5; next }
                if ($0 ~ /^[[:space:]]*\}[[:space:]]*$/) { state = 4; next }
                printf "unexpected manifest field syntax at line %d\n", NR; state = 99; next
            }
            state == 2 {
                if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) {
                    if (file_count > 0 && prev_file_had_comma == 1) {
                        printf "manifest files map has a trailing comma before line %d\n", NR
                    }
                    state = ($0 ~ /,[[:space:]]*$/) ? 1 : 3
                    next
                }
                if ($0 ~ /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"[0-9a-f]{64}"[[:space:]]*,?[[:space:]]*$/) {
                    if (file_count > 0 && prev_file_no_comma == 1) {
                        printf "manifest files entry before line %d is missing a trailing comma\n", NR
                    }
                    file_count++
                    prev_file_had_comma = ($0 ~ /,[[:space:]]*$/) ? 1 : 0
                    prev_file_no_comma = (prev_file_had_comma == 1) ? 0 : 1
                    next
                }
                printf "unexpected manifest files entry syntax at line %d\n", NR; state = 99; next
            }
            state == 3 {
                if ($0 ~ /^[[:space:]]*}[[:space:]]*$/) { state = 4; next }
                printf "manifest JSON has trailing content at line %d\n", NR; state = 99; next
            }
            state == 4 {
                printf "manifest JSON has trailing content at line %d\n", NR; state = 99; next
            }
            state == 5 {
                if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) { state = ($0 ~ /,[[:space:]]*$/) ? 1 : 3; next }
                if ($0 ~ /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{[[:space:]]*$/) { state = 6; override_count++; next }
                if ($0 ~ /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{.*\}[[:space:]]*,?[[:space:]]*$/) { override_count++; next }
                printf "unexpected local_overrides entry syntax at line %d\n", NR; state = 99; next
            }
            state == 6 {
                if ($0 ~ /^[[:space:]]*"(base_sha256|current_sha256|reason|accepted_at)"[[:space:]]*:[[:space:]]*"[^"]*"[[:space:]]*,?[[:space:]]*$/) { next }
                if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) { state = 5; next }
                printf "unexpected local_overrides field syntax at line %d\n", NR; state = 99; next
            }
            END {
                if (state != 4 && state != 99) {
                    printf "manifest JSON ended before the object closed\n"
                }
            }
        ')"
        if [ -n "$manifest_syntax_errors" ]; then
            while IFS= read -r err; do
                [ -n "$err" ] && fail "$manifest_rel  $err"
            done <<< "$manifest_syntax_errors"
        fi

        source_repo="$(printf '%s\n' "$manifest_json" | awk -F'"' '/"files"[[:space:]]*:/ { exit } /"source_repo"[[:space:]]*:/ { print $4; exit }')"
        source_ref="$(printf '%s\n' "$manifest_json" | awk -F'"' '/"files"[[:space:]]*:/ { exit } /"source_ref"[[:space:]]*:/ { print $4; exit }')"
        installed_sha="$(printf '%s\n' "$manifest_json" | awk -F'"' '/"files"[[:space:]]*:/ { exit } /"installed_sha"[[:space:]]*:/ { print $4; exit }')"
        installed_at="$(printf '%s\n' "$manifest_json" | awk -F'"' '/"files"[[:space:]]*:/ { exit } /"installed_at"[[:space:]]*:/ { print $4; exit }')"

        [ -z "$source_repo" ] && fail "$manifest_rel  manifest is missing source_repo"
        [ -z "$source_ref" ] && fail "$manifest_rel  manifest is missing source_ref"
        [ -z "$installed_at" ] && fail "$manifest_rel  manifest is missing installed_at"
        if ! printf '%s' "$installed_sha" | grep -qE '^[0-9a-f]{40}$'; then
            fail "$manifest_rel  installed_sha must be a 40-character lowercase git sha"
        fi

        manifest_entries="$(printf '%s\n' "$manifest_json" | awk '
            /"files"[[:space:]]*:[[:space:]]*\{/ { in_files = 1; next }
            in_files == 1 && /^[[:space:]]*}[,]?[[:space:]]*$/ { exit }
            in_files == 1 { print }
        ')"

        override_data="$(printf '%s\n' "$manifest_json" | awk -F'"' '
            /"local_overrides"[[:space:]]*:[[:space:]]*\{/ { in_overrides = 1; next }
            in_overrides == 1 && override_path == "" && /^[[:space:]]*}[,]?[[:space:]]*$/ { exit }
            in_overrides == 1 && override_path == "" && /^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*\{/ {
                override_path = $2
                base = ""; current = ""; reason = 0; accepted = 0
                for (i = 4; i <= NF; i += 2) {
                    if ($i == "base_sha256") base = $(i + 2)
                    if ($i == "current_sha256") current = $(i + 2)
                    if ($i == "reason") reason = 1
                    if ($i == "accepted_at") accepted = 1
                }
                if ($0 ~ /}[[:space:]]*,?[[:space:]]*$/) {
                    printf "%s\t%s\t%s\t%d\t%d\n", override_path, base, current, reason, accepted
                    override_path = ""
                }
                next
            }
            in_overrides == 1 && override_path != "" {
                for (i = 2; i <= NF; i += 2) {
                    if ($i == "base_sha256") base = $(i + 2)
                    if ($i == "current_sha256") current = $(i + 2)
                    if ($i == "reason") reason = 1
                    if ($i == "accepted_at") accepted = 1
                }
                if ($0 ~ /^[[:space:]]*}[,]?[[:space:]]*$/) {
                    printf "%s\t%s\t%s\t%d\t%d\n", override_path, base, current, reason, accepted
                    override_path = ""
                }
            }
        ')"

        EXPECTED_DATA=""
        ACTUAL_DATA=""
        manifest_count=0
        while IFS= read -r line; do
            [ -z "$line" ] && continue
            path="$(printf '%s\n' "$line" | awk -F'"' '{ print $2 }')"
            expected_hash="$(printf '%s\n' "$line" | awk -F'"' '{ print $4 }')"
            [ -z "$path" ] && continue
            manifest_count=$((manifest_count + 1))

            case "$path" in
                /*|*\\*|*../*|../*) fail "$manifest_rel  invalid manifest path '$path'"; continue ;;
            esac
            case "$path" in
                .github/agents/dude-local-*.agent.md|.github/skills/dude-local-*/*) fail "$manifest_rel  manifest path '$path' uses the reserved project-local namespace"; continue ;;
                .github/agents/dude.agent.md|.github/instructions/dude.instructions.md) ;;
                .github/agents/dude-*.agent.md) ;;
                .github/skills/dude-*/*) ;;
                *) fail "$manifest_rel  manifest path '$path' is outside the dude- core namespace"; continue ;;
            esac
            if ! printf '%s' "$expected_hash" | grep -qE '^[0-9a-f]{64}$'; then
                fail "$manifest_rel  invalid SHA-256 for '$path'"
                continue
            fi
            EXPECTED_DATA="${EXPECTED_DATA}${path}"$'\t'"${expected_hash}"$'\n'
            full_path="$ROOT/$path"
            if [ ! -e "$full_path" ]; then
                fail "$manifest_rel  manifest file '$path' does not exist"
                continue
            fi
            if [ -d "$full_path" ]; then
                fail "$manifest_rel  manifest path '$path' resolves to a directory"
                continue
            fi
            actual_hash="$(file_sha256 "$full_path")"
            ACTUAL_DATA="${ACTUAL_DATA}${path}"$'\t'"${actual_hash}"$'\n'
            if [ "$actual_hash" != "$expected_hash" ]; then
                has_override=0
                override_line="$(printf '%s' "$override_data" | awk -F'\t' -v p="$path" '$1 == p { print; exit }')"
                if [ -n "$override_line" ]; then
                    override_base="$(printf '%s\n' "$override_line" | awk -F'\t' '{ print $2 }')"
                    override_current="$(printf '%s\n' "$override_line" | awk -F'\t' '{ print $3 }')"
                    if [ "$override_base" = "$expected_hash" ] && [ "$override_current" = "$actual_hash" ]; then
                        has_override=1
                    fi
                fi
                if [ "$has_override" -ne 1 ]; then
                    fail "$manifest_rel  manifest hash mismatch for '$path' (local edit or stale manifest; run @dude upgrade --dry-run to classify, then confirm upgrade if it reports Metadata refresh)"
                fi
            fi
        done <<< "$manifest_entries"

        if [ "$manifest_count" -eq 0 ]; then
            fail "$manifest_rel  files map must be seeded and non-empty"
        fi

        if [ -n "$override_data" ]; then
            while IFS=$'\t' read -r override_path override_base override_current override_reason override_accepted; do
                [ -z "$override_path" ] && continue
                case "$override_path" in
                    /*|*\\*|*../*|../*) fail "$manifest_rel  invalid local override path '$override_path'"; continue ;;
                esac
                expected_line="$(printf '%s' "$EXPECTED_DATA" | awk -F'\t' -v p="$override_path" '$1 == p { print; exit }')"
                if [ -z "$expected_line" ]; then
                    fail "$manifest_rel  local override '$override_path' is not listed in files"
                    continue
                fi
                expected_hash="$(printf '%s\n' "$expected_line" | awk -F'\t' '{ print $2 }')"
                if ! printf '%s' "$override_base" | grep -qE '^[0-9a-f]{64}$'; then
                    fail "$manifest_rel  local override '$override_path' has invalid base_sha256"
                    continue
                fi
                if ! printf '%s' "$override_current" | grep -qE '^[0-9a-f]{64}$'; then
                    fail "$manifest_rel  local override '$override_path' has invalid current_sha256"
                    continue
                fi
                if [ "$override_reason" != "1" ]; then
                    fail "$manifest_rel  local override '$override_path' is missing 'reason'"
                fi
                if [ "$override_accepted" != "1" ]; then
                    fail "$manifest_rel  local override '$override_path' is missing 'accepted_at'"
                fi
                if [ "$override_base" != "$expected_hash" ]; then
                    fail "$manifest_rel  local override '$override_path' base_sha256 does not match files entry"
                    continue
                fi
                actual_line="$(printf '%s' "$ACTUAL_DATA" | awk -F'\t' -v p="$override_path" '$1 == p { print; exit }')"
                actual_hash="$(printf '%s\n' "$actual_line" | awk -F'\t' '{ print $2 }')"
                if [ -n "$actual_hash" ] && [ "$override_current" != "$actual_hash" ]; then
                    fail "$manifest_rel  local override '$override_path' current_sha256 does not match the current file"
                    continue
                fi
                if [ "$override_current" != "$override_base" ]; then
                    warn "$manifest_rel  accepted local override for '$override_path' (hash differs from base)"
                fi
            done <<< "$override_data"
        fi
    fi
fi

# --- Check 3b: project-local namespace advisories ---------------------------
# Build a quick lookup of manifest paths so on-disk artifacts already covered
# by core do not double-warn.
MANIFEST_PATHS=":"
if [ -f "$MANIFEST" ]; then
    while IFS= read -r line; do
        path="$(printf '%s\n' "$line" | awk -F'"' '{ print $2 }')"
        [ -n "$path" ] && MANIFEST_PATHS="${MANIFEST_PATHS}${path}:"
    done < <(awk '
        /"files"[[:space:]]*:[[:space:]]*\{/ { in_files = 1; next }
        in_files == 1 && /^[[:space:]]*}[,]?[[:space:]]*$/ { exit }
        in_files == 1 { print }
    ' "$MANIFEST")
fi

manifest_has_path() {
    case "$MANIFEST_PATHS" in
        *":$1:"*) return 0 ;;
        *)        return 1 ;;
    esac
}

manifest_has_prefix() {
    case "$MANIFEST_PATHS" in
        *":$1"*) return 0 ;;
        *)       return 1 ;;
    esac
}

if [ -d "$ROOT/.github/agents" ]; then
    while IFS= read -r -d '' f; do
        bn="$(basename "$f")"
        rel=".github/agents/$bn"
        manifest_has_path "$rel" && continue
        [ "$bn" = "dude.agent.md" ] && continue
        case "$bn" in
            dude-local-*) continue ;;
        esac
        warn "$rel  unreserved project-owned agent (rename to .github/agents/dude-local-<slug>.agent.md to avoid future upstream collisions)"
    done < <(find "$ROOT/.github/agents" -maxdepth 1 -type f -name '*.agent.md' -print0 2>/dev/null)
fi

if [ -d "$ROOT/.github/skills" ]; then
    while IFS= read -r -d '' d; do
        bn="$(basename "$d")"
        [ "$bn" = "project" ] && continue
        case "$bn" in
            dude-local-*) continue ;;
        esac
        rel=".github/skills/$bn/"
        manifest_has_prefix "$rel" && continue
        warn "$rel  unreserved project-owned skill (rename to .github/skills/dude-local-<slug>/ to avoid future upstream collisions)"
    done < <(find "$ROOT/.github/skills" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
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
        ' "$file" | sed -e 's/-<[a-zA-Z][a-zA-Z0-9_-]*>//g' -e 's/<[a-zA-Z][a-zA-Z0-9_-]*>//g')"
        # Match @<role> only when not preceded by alphanumeric (so durable task
        # ID suffixes like T001@a1b2c3d4 do not register as role refs).
        # POSIX ERE has no lookbehind; capture an optional leading boundary char
        # in the match and strip it in awk.
        tokens="$(printf '%s' "$content" | grep -oE '(^|[^[:alnum:]_])@[a-z]([a-z0-9-]*[a-z0-9])?' | awk '{ sub(/^[^@]*/, ""); print }' | sort -u || true)"
        if [ -n "$tokens" ]; then
            while IFS= read -r token; do
                role="${token#@}"
                # Documentation placeholders such as @dude-local-<slug> collapse
                # to @dude-local after placeholder stripping; real dude-local
                # handles must still resolve to agent files.
                case "$role" in
                    dude-local) continue ;;
                esac
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
            dude.agent.md|dude-spec-lead.agent.md) continue ;;
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
        ' "$file" | sed -e 's/-<[a-zA-Z][a-zA-Z0-9_-]*>//g' -e 's/<[a-zA-Z][a-zA-Z0-9_-]*>//g')"
        tokens="$(printf '%s' "$content" | grep -oE '\.github/skills/[a-z]([a-z0-9-]*[a-z0-9])?' | awk '{ sub(/^.*\//, ""); print }' | sort -u || true)"
        if [ -n "$tokens" ]; then
            while IFS= read -r name; do
                [ -z "$name" ] && continue
                # Documentation placeholders such as .github/skills/dude-local-<slug>/
                # collapse to dude-local after placeholder stripping; real
                # dude-local skill paths must still resolve to skill directories.
                case "$name" in
                    dude-local) continue ;;
                esac
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
