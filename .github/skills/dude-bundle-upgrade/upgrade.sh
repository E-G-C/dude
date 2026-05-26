#!/usr/bin/env bash
# upgrade.sh — engine for dude-bundle-upgrade.
#
# Read-only subcommands:
#   status   compare local bundle manifest against upstream manifest
#   plan     fetch upstream tree, classify every file, persist a plan file
#
# Write-capable subcommands:
#   apply     apply a persisted plan (safety tag + branch + writes + commit)
#   rollback  reset HEAD to the most recent dude-pre-upgrade-* safety tag
#
# Manifest format: metadata only — the manifest carries source_repo,
# source_ref, installed_sha, and installed_at. Base ownership is determined
# purely by the namespace convention: `.github/agents/dude.agent.md`,
# `.github/agents/dude-<slug>.agent.md`, `.github/skills/dude-<slug>/**`, and
# `.github/instructions/dude.instructions.md`, excluding the reserved
# `dude-local-<slug>` namespace which is project-owned. Base files are always
# overwritten from upstream on apply. Editing any base-owned file is
# unsupported; users who want a customized variant must fork to the reserved
# `dude-local-<slug>` namespace. The upgrader silently overwrites anything
# under the base namespace (with a pre-overwrite git diff warning at apply
# time).
#
# Dependency baseline (matches dude-lint plus network tools):
#   POSIX bash, awk, grep, sha256sum or shasum, diff, cmp, find,
#   git (required: the local project must be inside a git working tree;
#        used for fetch, safety tags, branches, rollback, and pre-overwrite
#        drift detection),
#   curl or wget (for github raw fast path),
#   tar (for github tarball fallback).
#
# Usage:
#   bash .github/skills/dude-bundle-upgrade/upgrade.sh status   [--format text|json] [--source <s>] [--ref <r>]
#   bash .github/skills/dude-bundle-upgrade/upgrade.sh plan     [--format text|json] [--source <s>] [--ref <r>] [--out <path>]
#   bash .github/skills/dude-bundle-upgrade/upgrade.sh apply    --plan <id|path> --confirm confirm-upgrade [--skip-removals] [--allow-dirty] [--format text|json]
#   bash .github/skills/dude-bundle-upgrade/upgrade.sh rollback [--tag <name>] [--allow-dirty] [--format text|json]
#   bash .github/skills/dude-bundle-upgrade/upgrade.sh help
#
# Exit codes:
#   0   no changes (up_to_date) or successful action
#   10  plan ready, changes detected
#   40  invalid input, malformed manifest, unreachable upstream, or post-apply lint failure
#
# JSON output on stdout is the machine contract.
# Text output on stdout is human-facing.
# All diagnostics go to stderr.

set -u

# ----- globals ---------------------------------------------------------------

ROOT="$(pwd)"
CACHE_ROOT="${TMPDIR:-/tmp}/dude-upgrade-cache"
PLANS_DIR="$CACHE_ROOT/plans"

# Reserved local namespace fragments.
RESERVED_AGENT_PREFIX=".github/agents/dude-local-"
RESERVED_SKILL_PREFIX=".github/skills/dude-local-"

# Color only on tty.
if [ -t 2 ]; then
    YEL=$'\033[33m'; RED=$'\033[31m'; GRN=$'\033[32m'; CYA=$'\033[36m'; DIM=$'\033[2m'; RST=$'\033[0m'
else
    YEL=""; RED=""; GRN=""; CYA=""; DIM=""; RST=""
fi

# ----- logging (stderr) ------------------------------------------------------

log_info()  { printf '%s[upgrade]%s %s\n' "$CYA" "$RST" "$1" >&2; }
log_warn()  { printf '%s[upgrade]%s %s\n' "$YEL" "$RST" "$1" >&2; }
log_error() { printf '%s[upgrade]%s %s\n' "$RED" "$RST" "$1" >&2; }
log_debug() { [ -n "${UPGRADE_DEBUG:-}" ] && printf '%s[upgrade]%s %s\n' "$DIM" "$RST" "$1" >&2 || true; }

# ----- json helpers ----------------------------------------------------------

# json_str — emit a JSON string (with surrounding quotes) from $1.
json_str() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    # Replace literal control chars; values here are paths, hashes, refs — no
    # tab/newline expected, but be defensive.
    s="$(printf '%s' "$s" | tr '\t\r\n' '   ')"
    printf '"%s"' "$s"
}

# json_num — emit a JSON number from $1 (defaults to 0 if not numeric).
json_num() {
    case "$1" in
        ''|*[!0-9-]*) printf '0' ;;
        *) printf '%s' "$1" ;;
    esac
}

# ----- sha / file helpers ----------------------------------------------------

short_sha() {
    printf '%s' "$1" | cut -c1-12
}

iso_now() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

stamp_now() {
    date -u +%Y%m%d-%H%M%S
}

iso_plus_seconds() {
    local secs="$1"
    if date -u -v+"${secs}"S +%Y-%m-%dT%H:%M:%SZ >/dev/null 2>&1; then
        date -u -v+"${secs}"S +%Y-%m-%dT%H:%M:%SZ
    else
        date -u -d "@$(($(date -u +%s) + secs))" +%Y-%m-%dT%H:%M:%SZ
    fi
}

# ----- manifest parsing ------------------------------------------------------

# extract_manifest_json <path> — print the fenced ```json ... ``` block.
extract_manifest_json() {
    awk '
        BEGIN { in_json = 0 }
        /^```json[[:space:]]*$/ { in_json = 1; next }
        /^```[[:space:]]*$/ && in_json == 1 { exit }
        in_json == 1 { print }
    ' "$1"
}

# manifest_top_field <json-text> <field>
manifest_top_field() {
    printf '%s\n' "$1" | awk -F'"' -v key="$2" '
        $0 ~ "\"" key "\"[[:space:]]*:" { print $4; exit }
    '
}

# validate_metadata_manifest <json-text> <label> — print error lines and
# return non-zero unless the manifest is exactly the metadata shape.
validate_metadata_manifest() {
    local json="$1"
    local label="$2"
    local errors=0
    local key

    while IFS= read -r key; do
        [ -z "$key" ] && continue
        case "$key" in
            source_repo|source_ref|installed_sha|installed_at) ;;
            *) printf "%s has unsupported field '%s'\n" "$label" "$key"; errors=1 ;;
        esac
    done <<EOF
$(printf '%s\n' "$json" | awk -F'"' '/^[[:space:]]*"[A-Za-z_][A-Za-z0-9_]*"[[:space:]]*:/ { print $2 }')
EOF

    local source_repo source_ref installed_sha installed_at
    source_repo="$(manifest_top_field "$json" source_repo)"
    source_ref="$(manifest_top_field "$json" source_ref)"
    installed_sha="$(manifest_top_field "$json" installed_sha)"
    installed_at="$(manifest_top_field "$json" installed_at)"

    [ -z "$source_repo" ] && { printf '%s is missing source_repo\n' "$label"; errors=1; }
    [ -z "$source_ref" ] && { printf '%s is missing source_ref\n' "$label"; errors=1; }
    [ -z "$installed_sha" ] && { printf '%s is missing installed_sha\n' "$label"; errors=1; }
    [ -z "$installed_at" ] && { printf '%s is missing installed_at\n' "$label"; errors=1; }
    if [ -n "$installed_sha" ] && ! printf '%s' "$installed_sha" | grep -qE '^[0-9a-f]{40}$'; then
        printf '%s installed_sha is not a 40-char hex sha\n' "$label"
        errors=1
    fi
    return "$errors"
}

# is_base_path <rel-path> — return 0 if the path falls in the upstream-owned
# `dude-` core namespace, 1 otherwise. The reserved `dude-local-` namespace
# is project-owned and explicitly excluded.
is_base_path() {
    case "$1" in
        .github/agents/dude.agent.md) return 0 ;;
        .github/agents/dude-local-*.agent.md) return 1 ;;
        .github/agents/dude-*.agent.md) return 0 ;;
        .github/skills/dude-local-*/*) return 1 ;;
        .github/skills/dude-*/*) return 0 ;;
        .github/instructions/dude.instructions.md) return 0 ;;
        *) return 1 ;;
    esac
}

# enumerate_base_paths <root> — print every base-namespace file path relative
# to <root>, one per line, sorted. This is the replacement for the old
# manifest `files` array: ownership is derived from the namespace convention
# rather than a path list.
enumerate_base_paths() {
    local root="$1"
    {
        if [ -d "$root/.github/agents" ]; then
            find "$root/.github/agents" -maxdepth 1 -type f -name 'dude*.agent.md' 2>/dev/null | while IFS= read -r abs; do
                local rel="${abs#$root/}"
                is_base_path "$rel" && printf '%s\n' "$rel"
            done
        fi
        if [ -f "$root/.github/instructions/dude.instructions.md" ]; then
            printf '%s\n' ".github/instructions/dude.instructions.md"
        fi
        if [ -d "$root/.github/skills" ]; then
            find "$root/.github/skills" -mindepth 1 -maxdepth 1 -type d -name 'dude-*' 2>/dev/null | while IFS= read -r d; do
                local base="${d##*/}"
                case "$base" in
                    dude-local-*) ;;
                    *)
                        find "$d" -type f 2>/dev/null | while IFS= read -r abs; do
                            local rel="${abs#$root/}"
                            printf '%s\n' "$rel"
                        done
                        ;;
                esac
            done
        fi
    } | LC_ALL=C sort -u
}

# load_local_manifest — sets globals from $ROOT/.github/dudestuff/bundle-manifest.md.
# Manifest carries metadata only (source_repo, source_ref, installed_sha,
# installed_at); base ownership is derived from the namespace convention via
# enumerate_base_paths.
LOCAL_MANIFEST_PATH="$ROOT/.github/dudestuff/bundle-manifest.md"
LOCAL_JSON=""
LOCAL_SOURCE_REPO=""
LOCAL_SOURCE_REF=""
LOCAL_INSTALLED_SHA=""
LOCAL_INSTALLED_AT=""

load_local_manifest() {
    if [ ! -f "$LOCAL_MANIFEST_PATH" ]; then
        return 40
    fi
    LOCAL_JSON="$(extract_manifest_json "$LOCAL_MANIFEST_PATH")"
    if [ -z "$LOCAL_JSON" ]; then
        return 40
    fi
    LOCAL_SOURCE_REPO="$(manifest_top_field "$LOCAL_JSON" source_repo)"
    LOCAL_SOURCE_REF="$(manifest_top_field "$LOCAL_JSON" source_ref)"
    LOCAL_INSTALLED_SHA="$(manifest_top_field "$LOCAL_JSON" installed_sha)"
    LOCAL_INSTALLED_AT="$(manifest_top_field "$LOCAL_JSON" installed_at)"
    validate_metadata_manifest "$LOCAL_JSON" "local manifest" >/dev/null || return 40
    return 0
}

# ----- upstream resolution ---------------------------------------------------

# Sets globals for upstream source after CLI overrides.
UPSTREAM_SOURCE=""
UPSTREAM_REF=""

resolve_upstream() {
    local src_override="${1:-}"
    local ref_override="${2:-}"
    UPSTREAM_SOURCE="${src_override:-$LOCAL_SOURCE_REPO}"
    UPSTREAM_REF="${ref_override:-$LOCAL_SOURCE_REF}"
    if [ -z "$UPSTREAM_SOURCE" ]; then
        UPSTREAM_SOURCE="https://github.com/E-G-C/dude"
    fi
    if [ -z "$UPSTREAM_REF" ]; then
        UPSTREAM_REF="main"
    fi
}

# Detect github owner/repo from "https://github.com/<owner>/<repo>(.git)?".
github_owner_repo() {
    local url="$1"
    case "$url" in
        https://github.com/*)
            local rest="${url#https://github.com/}"
            rest="${rest%.git}"
            rest="${rest%/}"
            # rest is now owner/repo or owner/repo/extra; take first two.
            local owner="${rest%%/*}"
            local repo="${rest#$owner/}"
            repo="${repo%%/*}"
            if [ -n "$owner" ] && [ -n "$repo" ]; then
                printf '%s/%s\n' "$owner" "$repo"
            fi
            ;;
    esac
}

# Try to fetch only the upstream bundle-manifest.md.
# Writes the manifest file path to stdout on success, returns 0.
# Returns non-zero on failure (no manifest path printed).
fetch_upstream_manifest_only() {
    mkdir -p "$CACHE_ROOT"
    local out_dir
    out_dir="$(mktemp -d "$CACHE_ROOT/manifest-XXXXXX")"
    local out="$out_dir/bundle-manifest.md"
    local owner_repo
    owner_repo="$(github_owner_repo "$UPSTREAM_SOURCE")"

    # Local path source.
    if [ -d "$UPSTREAM_SOURCE" ]; then
        local local_manifest="$UPSTREAM_SOURCE/.github/dudestuff/bundle-manifest.md"
        if [ -f "$local_manifest" ]; then
            cp "$local_manifest" "$out"
            printf '%s\n' "$out"
            return 0
        fi
        rm -rf "$out_dir"
        return 1
    fi

    # GitHub raw fast path.
    if [ -n "$owner_repo" ]; then
        local raw_url="https://raw.githubusercontent.com/$owner_repo/$UPSTREAM_REF/.github/dudestuff/bundle-manifest.md"
        log_debug "fetching upstream manifest via raw url: $raw_url"
        if command -v curl >/dev/null 2>&1; then
            if curl -fsSL --max-time 30 "$raw_url" -o "$out" 2>/dev/null; then
                printf '%s\n' "$out"
                return 0
            fi
        fi
        if command -v wget >/dev/null 2>&1; then
            if wget -q --timeout=30 -O "$out" "$raw_url" 2>/dev/null; then
                printf '%s\n' "$out"
                return 0
            fi
        fi
    fi

    # Shallow clone fallback (works for any git source, including non-github).
    if command -v git >/dev/null 2>&1; then
        local clone_dir="$out_dir/clone"
        log_debug "shallow-cloning upstream for manifest only: $UPSTREAM_SOURCE @ $UPSTREAM_REF"
        if git clone --quiet --depth=1 --branch "$UPSTREAM_REF" "$UPSTREAM_SOURCE" "$clone_dir" 2>/dev/null; then
            if [ -f "$clone_dir/.github/dudestuff/bundle-manifest.md" ]; then
                cp "$clone_dir/.github/dudestuff/bundle-manifest.md" "$out"
                printf '%s\n' "$out"
                return 0
            fi
        fi
    fi

    rm -rf "$out_dir"
    return 1
}

# Fetch the full upstream tree to $CACHE_ROOT/upstream-<key>/.
# Prints the path to the root of the fetched tree on success.
# Returns non-zero on failure.
fetch_upstream_tree() {
    mkdir -p "$CACHE_ROOT"

    # Local path source — symlink-like behavior via direct path use.
    if [ -d "$UPSTREAM_SOURCE" ]; then
        if [ ! -f "$UPSTREAM_SOURCE/.github/dudestuff/bundle-manifest.md" ]; then
            log_error "local upstream source is missing .github/dudestuff/bundle-manifest.md"
            return 1
        fi
        printf '%s\n' "$UPSTREAM_SOURCE"
        return 0
    fi

    if ! command -v git >/dev/null 2>&1; then
        log_error "git is required to fetch upstream tree"
        return 1
    fi

    local key
    key="$(printf '%s|%s' "$UPSTREAM_SOURCE" "$UPSTREAM_REF" | $(command -v sha256sum >/dev/null 2>&1 && echo sha256sum || echo "shasum -a 256") | awk '{ print substr($1, 1, 12) }')"
    local dest="$CACHE_ROOT/upstream-$key"

    # Re-use cache for short-lived re-runs.
    if [ -d "$dest/.git" ] && [ -f "$dest/.github/dudestuff/bundle-manifest.md" ]; then
        printf '%s\n' "$dest"
        return 0
    fi

    rm -rf "$dest"
    log_info "fetching upstream tree: $UPSTREAM_SOURCE @ $UPSTREAM_REF"
    if git clone --quiet --depth=1 --branch "$UPSTREAM_REF" "$UPSTREAM_SOURCE" "$dest" 2>/dev/null; then
        printf '%s\n' "$dest"
        return 0
    fi
    # Commit-sha ref fallback: full clone + checkout.
    if git clone --quiet "$UPSTREAM_SOURCE" "$dest" 2>/dev/null; then
        ( cd "$dest" && git checkout --quiet "$UPSTREAM_REF" ) 2>/dev/null && {
            printf '%s\n' "$dest"
            return 0
        }
    fi
    rm -rf "$dest"
    log_error "failed to fetch upstream from $UPSTREAM_SOURCE @ $UPSTREAM_REF"
    return 1
}

# Read the HEAD sha of a git tree (or empty string for local non-git sources).
tree_head_sha() {
    local dir="$1"
    if [ -d "$dir/.git" ] && command -v git >/dev/null 2>&1; then
        ( cd "$dir" && git rev-parse HEAD 2>/dev/null ) || true
    fi
}

# Resolve the live upstream ref to a commit sha. This is the authoritative
# upgrade trigger.
#
# Discovery order:
#   1. local-path source: git rev-parse HEAD inside the source dir
#   2. remote source: git ls-remote <source> <ref>
#   3. ref that already looks like a full sha: pass through
#
# Prints the sha on success, empty string on failure.
resolve_upstream_sha() {
    if [ -d "$UPSTREAM_SOURCE" ]; then
        if [ -d "$UPSTREAM_SOURCE/.git" ] && command -v git >/dev/null 2>&1; then
            ( cd "$UPSTREAM_SOURCE" && git rev-parse HEAD 2>/dev/null ) || true
        fi
        return
    fi

    if ! command -v git >/dev/null 2>&1; then
        return
    fi

    local out
    out="$(git ls-remote "$UPSTREAM_SOURCE" "$UPSTREAM_REF" 2>/dev/null | awk 'NR==1 {print $1}')"
    if [ -n "$out" ]; then
        printf '%s\n' "$out"
        return
    fi

    if printf '%s' "$UPSTREAM_REF" | grep -qE '^[0-9a-f]{40}$'; then
        printf '%s\n' "$UPSTREAM_REF"
    fi
}

# ----- upstream manifest validation -----------------------------------------

# validate_upstream_manifest <json-text> — print error lines and return
# non-zero unless the upstream manifest matches the metadata shape.
validate_upstream_manifest() {
    validate_metadata_manifest "$1" "upstream manifest"
}

# ----- classification --------------------------------------------------------

# Globals populated by classify_plan.
CLS_REPLACE=""        # path\tplus\tminus
CLS_ADD=""            # path
CLS_REMOVE=""         # path
CLS_ADVISORY=""       # path\tkind
CLS_UPTODATE_COUNT=0

count_lines_tsv() {
    [ -z "$1" ] && { printf '0'; return; }
    printf '%s\n' "$1" | grep -c -v '^$' || true
}

# diff_plus_minus <local_file> <upstream_file> -> "<+a>\t<-b>"
diff_plus_minus() {
    local a="$1" b="$2"
    if [ ! -f "$a" ] || [ ! -f "$b" ]; then
        printf '0\t0'
        return
    fi
    diff -u "$a" "$b" 2>/dev/null | awk '
        BEGIN { plus = 0; minus = 0 }
        /^\+\+\+/ { next }
        /^---/    { next }
        /^\+/     { plus++ }
        /^-/      { minus++ }
        END       { printf "%d\t%d", plus, minus }
    '
}

# classify_plan <upstream_tree>
#
# Classification model (namespace-based):
#   * Base ownership is derived from the namespace convention via
#     enumerate_base_paths: anything under .github/agents/dude*.agent.md,
#     .github/skills/dude-*/**, or .github/instructions/dude.instructions.md
#     is base-owned (excluding the reserved .github/agents/dude-local-*.agent.md
#     and .github/skills/dude-local-*/** project namespaces).
#   * Local edits to base files are detected at apply time via a single
#     git diff <installed_sha> -- <files>.
#   * Buckets:
#       replace    -- base path on both sides, on-disk bytes differ from upstream
#       add        -- base path only in the upstream tree
#       remove     -- base path only in the local tree (upstream dropped it)
#       advisory   -- project-owned agent/skill outside both the base and
#                     dude-local- namespaces (informational only)
#       up_to_date -- base path on both sides, bytes match (counted only)
classify_plan() {
    local utree="$1"

    CLS_REPLACE=""; CLS_ADD=""; CLS_REMOVE=""
    CLS_ADVISORY=""
    CLS_UPTODATE_COUNT=0

    local tmp
    tmp="$(mktemp -d "$CACHE_ROOT/classify-XXXXXX")"
    enumerate_base_paths "$ROOT"  >"$tmp/local.txt"
    enumerate_base_paths "$utree" >"$tmp/upstream.txt"

    # Walk upstream entries.
    while IFS= read -r upath; do
        [ -z "$upath" ] && continue
        local in_local
        in_local="$(awk -v p="$upath" '$0 == p { print 1; exit }' "$tmp/local.txt")"
        local local_disk="$ROOT/$upath"
        local upstream_file="$utree/$upath"

        if [ -z "$in_local" ]; then
            CLS_ADD="${CLS_ADD}${upath}"$'\n'
            continue
        fi

        if [ ! -f "$local_disk" ]; then
            # In local namespace enumeration but missing on disk (rare race)
            # -- treat as replace so the file gets restored from upstream.
            CLS_REPLACE="${CLS_REPLACE}${upath}"$'\t'"0"$'\t'"0"$'\n'
            continue
        fi

        if cmp -s "$local_disk" "$upstream_file"; then
            CLS_UPTODATE_COUNT=$((CLS_UPTODATE_COUNT + 1))
        else
            local pm
            pm="$(diff_plus_minus "$local_disk" "$upstream_file")"
            local p m
            p="$(printf '%s' "$pm" | awk -F'\t' '{ print $1 }')"
            m="$(printf '%s' "$pm" | awk -F'\t' '{ print $2 }')"
            CLS_REPLACE="${CLS_REPLACE}${upath}"$'\t'"${p}"$'\t'"${m}"$'\n'
        fi
    done <"$tmp/upstream.txt"

    # Removals: base path in local tree but not in upstream tree.
    while IFS= read -r lpath; do
        [ -z "$lpath" ] && continue
        local in_upstream
        in_upstream="$(awk -v p="$lpath" '$0 == p { print 1; exit }' "$tmp/upstream.txt")"
        if [ -z "$in_upstream" ]; then
            CLS_REMOVE="${CLS_REMOVE}${lpath}"$'\n'
        fi
    done <"$tmp/local.txt"

    # Advisories: project-owned agents/skills outside both the base and
    # dude-local- namespaces. Informational only -- they are never touched
    # by apply.
    if [ -d "$ROOT/.github/agents" ]; then
        while IFS= read -r agent; do
            [ -z "$agent" ] && continue
            local rel="${agent#$ROOT/}"
            local bn="${rel##*/}"
            [ "$bn" = "dude.agent.md" ] && continue
            case "$bn" in
                dude-local-*) continue ;;
                dude-*) continue ;;
            esac
            CLS_ADVISORY="${CLS_ADVISORY}${rel}"$'\t'"unreserved_local_agent"$'\n'
        done < <(find "$ROOT/.github/agents" -mindepth 1 -maxdepth 1 -name '*.agent.md' 2>/dev/null)
    fi
    if [ -d "$ROOT/.github/skills" ]; then
        while IFS= read -r skill_dir; do
            [ -z "$skill_dir" ] && continue
            local bn="${skill_dir##*/}"
            [ "$bn" = "project" ] && continue
            case "$bn" in
                dude-local-*) continue ;;
                dude-*) continue ;;
            esac
            local skill_md="$skill_dir/SKILL.md"
            [ ! -f "$skill_md" ] && continue
            local rel_md="${skill_md#$ROOT/}"
            CLS_ADVISORY="${CLS_ADVISORY}${rel_md}"$'\t'"unreserved_local_skill"$'\n'
        done < <(find "$ROOT/.github/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)
    fi

    rm -rf "$tmp"
}

# ----- emitters --------------------------------------------------------------

emit_status_text() {
    local kind="$1"          # up_to_date | upgrade_available | offline | error
    local upstream_sha="$2"
    local detail="${3:-}"

    printf 'Bundle: '
    case "$kind" in
        up_to_date)         printf '%sup to date%s\n' "$GRN" "$RST" ;;
        upgrade_available)  printf '%supgrade available%s\n' "$YEL" "$RST" ;;
        offline)            printf '%supgrade status unavailable (%s)%s\n' "$YEL" "$detail" "$RST" ;;
        error)              printf '%serror (%s)%s\n' "$RED" "$detail" "$RST" ;;
    esac
    printf '  Source:    %s @ %s\n' "$UPSTREAM_SOURCE" "$UPSTREAM_REF"
    printf '  Installed: %s (%s)\n' "$(short_sha "$LOCAL_INSTALLED_SHA")" "$LOCAL_INSTALLED_AT"
    if [ "$kind" = "upgrade_available" ] || [ "$kind" = "up_to_date" ]; then
        if [ -n "$upstream_sha" ]; then
            printf '  Upstream:  %s\n' "$(short_sha "$upstream_sha")"
        fi
    fi
    if [ "$kind" = "upgrade_available" ]; then
        printf '  Next:      @dude upgrade --dry-run\n'
    fi
}

emit_status_json() {
    local kind="$1"
    local upstream_sha="$2"
    local detail="${3:-}"
    printf '{\n'
    printf '  "status": %s,\n'         "$(json_str "$kind")"
    printf '  "source": %s,\n'         "$(json_str "$UPSTREAM_SOURCE")"
    printf '  "ref": %s,\n'            "$(json_str "$UPSTREAM_REF")"
    printf '  "installed_sha": %s,\n'  "$(json_str "$LOCAL_INSTALLED_SHA")"
    printf '  "installed_at": %s,\n'   "$(json_str "$LOCAL_INSTALLED_AT")"
    printf '  "upstream_sha": %s,\n'   "$(json_str "$upstream_sha")"
    printf '  "detail": %s\n'          "$(json_str "$detail")"
    printf '}\n'
}

emit_plan_text() {
    local plan_id="$1"
    local from_sha="$2"
    local to_sha="$3"
    local cache_dir="$4"

    local n_replace n_add n_remove n_adv
    n_replace="$(count_lines_tsv "$CLS_REPLACE")"
    n_add="$(count_lines_tsv "$CLS_ADD")"
    n_remove="$(count_lines_tsv "$CLS_REMOVE")"
    n_adv="$(count_lines_tsv "$CLS_ADVISORY")"

    printf 'Upgrade report: %s -> %s\n' "$(short_sha "$from_sha")" "$(short_sha "$to_sha")"
    printf 'Source: %s @ %s\n' "$UPSTREAM_SOURCE" "$UPSTREAM_REF"
    printf 'Plan ID: %s\n' "$plan_id"
    printf 'Cache: %s\n' "$cache_dir"
    printf '\n'

    _emit_list() {
        local label="$1"; local data="$2"; local count="$3"; local fmt="$4"
        printf '%s (%s):\n' "$label" "$count"
        if [ "$count" -eq 0 ]; then
            printf '  (none)\n'
        else
            printf '%s\n' "$data" | awk -F'\t' -v fmt="$fmt" '
                NF >= 1 && $1 != "" {
                    if (fmt == "replace") {
                        printf "  %s  [+%s / -%s]\n", $1, $2, $3
                    } else if (fmt == "advisory") {
                        printf "  %s  (%s)\n", $1, $2
                    } else {
                        printf "  %s\n", $1
                    }
                }
            '
        fi
        printf '\n'
    }
    _emit_list "Will replace (overwrite)"   "$CLS_REPLACE"   "$n_replace" "replace"
    _emit_list "Will add"                   "$CLS_ADD"       "$n_add"     "plain"
    _emit_list "Will remove"                "$CLS_REMOVE"    "$n_remove"  "plain"
    _emit_list "Advisories"                 "$CLS_ADVISORY"  "$n_adv"     "advisory"
    printf 'Up to date: %s\n' "$CLS_UPTODATE_COUNT"

    if [ $((n_replace + n_add + n_remove)) -eq 0 ]; then
        printf '\n%sAlready up to date.%s Nothing to apply.\n' "$GRN" "$RST"
    else
        printf '\n%sReady to apply.%s Reply "confirm upgrade" to proceed.\n' "$GRN" "$RST"
        if [ "$n_replace" -gt 0 ] || [ "$n_remove" -gt 0 ]; then
            printf '%sNote:%s any local edits to files in the Replace or Remove list will be\n' "$YEL" "$RST"
            printf 'discarded. Base files are upstream-owned; copy them under .github/agents/dude-local-<slug>.agent.md\n'
            printf 'or .github/skills/dude-local-<slug>/ before upgrading if you need to keep edits.\n'
        fi
    fi
}

# Emit a JSON array from TSV ($1) using $2 = field count and $3 = field names CSV.
_json_array_from_tsv() {
    local data="$1"
    local schema="$2"
    if [ -z "$data" ]; then
        printf '[]'
        return
    fi
    printf '['
    local first=1
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ $first -eq 1 ]; then first=0; else printf ','; fi
        printf '\n      {'
        local fields=()
        IFS=$'\t' read -r -a fields <<<"$line"
        local i=0
        local IFS_OLD="$IFS"
        IFS=','
        local names=($schema)
        IFS="$IFS_OLD"
        local first_field=1
        local name
        for name in "${names[@]}"; do
            local val="${fields[$i]:-}"
            if [ $first_field -eq 1 ]; then first_field=0; else printf ', '; fi
            case "$name" in
                added_lines|removed_lines)
                    printf '"%s": %s' "$name" "$(json_num "$val")"
                    ;;
                *)
                    printf '"%s": %s' "$name" "$(json_str "$val")"
                    ;;
            esac
            i=$((i + 1))
        done
        printf '}'
    done <<<"$data"
    printf '\n    ]'
}

emit_plan_json() {
    local plan_id="$1"
    local from_sha="$2"
    local to_sha="$3"
    local cache_dir="$4"
    local created_at="$5"
    local ttl_warn="$6"
    local ttl_expire="$7"

    local n_replace n_add n_remove n_adv
    n_replace="$(count_lines_tsv "$CLS_REPLACE")"
    n_add="$(count_lines_tsv "$CLS_ADD")"
    n_remove="$(count_lines_tsv "$CLS_REMOVE")"
    n_adv="$(count_lines_tsv "$CLS_ADVISORY")"

    printf '{\n'
    printf '  "plan_id": %s,\n'        "$(json_str "$plan_id")"
    printf '  "created_at": %s,\n'     "$(json_str "$created_at")"
    printf '  "ttl_warn_at": %s,\n'    "$(json_str "$ttl_warn")"
    printf '  "ttl_expire_at": %s,\n'  "$(json_str "$ttl_expire")"
    printf '  "source": %s,\n'         "$(json_str "$UPSTREAM_SOURCE")"
    printf '  "ref": %s,\n'            "$(json_str "$UPSTREAM_REF")"
    printf '  "from_sha": %s,\n'       "$(json_str "$from_sha")"
    printf '  "to_sha": %s,\n'         "$(json_str "$to_sha")"
    printf '  "cache_dir": %s,\n'      "$(json_str "$cache_dir")"
    printf '  "summary": {\n'
    printf '    "replace": %s,\n'     "$n_replace"
    printf '    "add": %s,\n'         "$n_add"
    printf '    "remove": %s,\n'      "$n_remove"
    printf '    "advisory": %s,\n'    "$n_adv"
    printf '    "up_to_date": %s\n'   "$CLS_UPTODATE_COUNT"
    printf '  },\n'
    printf '  "buckets": {\n'
    printf '    "replace": '
    _json_array_from_tsv "$CLS_REPLACE"  "path,added_lines,removed_lines"
    printf ',\n    "add": '
    _json_array_from_tsv "$CLS_ADD"      "path"
    printf ',\n    "remove": '
    _json_array_from_tsv "$CLS_REMOVE"   "path"
    printf ',\n    "advisory": '
    _json_array_from_tsv "$CLS_ADVISORY" "path,kind"
    printf '\n  }\n'
    printf '}\n'
}

# ----- subcommands -----------------------------------------------------------

cmd_help() {
    cat <<'EOF'
upgrade.sh — engine for dude-bundle-upgrade.

USAGE
  bash .github/skills/dude-bundle-upgrade/upgrade.sh <subcommand> [flags]

SUBCOMMANDS
  status     compare local manifest against upstream manifest (read-only)
  plan       fetch upstream tree, classify every file, persist plan (read-only)
  apply      apply a persisted plan: safety tag + branch + writes + commit
  rollback   reset HEAD to the most recent dude-pre-upgrade-* safety tag
  help       this message

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
  TMPDIR               override default /tmp for the upgrade cache
EOF
}

# Parse common flags for status/plan; populates FLAG_FORMAT, FLAG_SOURCE,
# FLAG_REF, FLAG_OUT. Unknown flags exit 40.
FLAG_FORMAT="text"
FLAG_SOURCE=""
FLAG_REF=""
FLAG_OUT=""

# Last failure reason for require_git_working_tree (used by callers when
# emitting structured errors).
GIT_PREFLIGHT_REASON=""

# require_git_working_tree — confirm git is installed and ROOT is inside a
# git working tree. Returns 0 on success. On failure, sets
# GIT_PREFLIGHT_REASON and returns 1; the caller decides how to report.
require_git_working_tree() {
    GIT_PREFLIGHT_REASON=""
    if ! command -v git >/dev/null 2>&1; then
        GIT_PREFLIGHT_REASON="git is not installed; install git and re-run"
        return 1
    fi
    if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        GIT_PREFLIGHT_REASON="not a git working tree (run 'git init' in the project root, then re-run)"
        return 1
    fi
    return 0
}

parse_common_flags() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --format)
                FLAG_FORMAT="${2:-}"; shift 2 ;;
            --format=*)
                FLAG_FORMAT="${1#--format=}"; shift ;;
            --source)
                FLAG_SOURCE="${2:-}"; shift 2 ;;
            --source=*)
                FLAG_SOURCE="${1#--source=}"; shift ;;
            --ref)
                FLAG_REF="${2:-}"; shift 2 ;;
            --ref=*)
                FLAG_REF="${1#--ref=}"; shift ;;
            --out)
                FLAG_OUT="${2:-}"; shift 2 ;;
            --out=*)
                FLAG_OUT="${1#--out=}"; shift ;;
            *)
                log_error "unknown flag: $1"
                return 40
                ;;
        esac
    done
    case "$FLAG_FORMAT" in
        text|json) ;;
        *) log_error "invalid --format: $FLAG_FORMAT (expected text|json)"; return 40 ;;
    esac
    return 0
}

cmd_status() {
    parse_common_flags "$@" || return 40

    if ! require_git_working_tree; then
        if [ "$FLAG_FORMAT" = "json" ]; then
            UPSTREAM_SOURCE="${FLAG_SOURCE:-unknown}"
            UPSTREAM_REF="${FLAG_REF:-unknown}"
            emit_status_json error "" "$GIT_PREFLIGHT_REASON"
        else
            log_error "$GIT_PREFLIGHT_REASON"
        fi
        return 40
    fi

    if ! load_local_manifest; then
        if [ "$FLAG_FORMAT" = "json" ]; then
            UPSTREAM_SOURCE="${FLAG_SOURCE:-unknown}"
            UPSTREAM_REF="${FLAG_REF:-unknown}"
            emit_status_json error "" "local manifest missing or malformed"
        else
            log_error "local bundle manifest missing or malformed: $LOCAL_MANIFEST_PATH"
        fi
        return 40
    fi
    resolve_upstream "$FLAG_SOURCE" "$FLAG_REF"

    local manifest_path
    if ! manifest_path="$(fetch_upstream_manifest_only)"; then
        if [ "$FLAG_FORMAT" = "json" ]; then
            emit_status_json offline "" "could not reach upstream"
        else
            emit_status_text offline "" "could not reach upstream"
        fi
        return 0
    fi

    local ujson
    ujson="$(extract_manifest_json "$manifest_path")"
    if [ -z "$ujson" ]; then
        if [ "$FLAG_FORMAT" = "json" ]; then
            emit_status_json error "" "upstream manifest has no fenced JSON block"
        else
            log_error "upstream manifest has no fenced JSON block"
        fi
        return 40
    fi

    local validation
    if ! validation="$(validate_upstream_manifest "$ujson")"; then
        if [ "$FLAG_FORMAT" = "json" ]; then
            emit_status_json error "" "$(printf '%s' "$validation" | head -1)"
        else
            log_error "upstream manifest invalid:"
            printf '%s\n' "$validation" | sed 's/^/  /' >&2
        fi
        return 40
    fi

    # Authoritative trigger: live upstream ref HEAD. Fall back to the upstream
    # manifest's installed_sha only when HEAD discovery is unavailable (no git
    # / opaque source).
    local upstream_sha
    upstream_sha="$(resolve_upstream_sha)"
    if [ -z "$upstream_sha" ]; then
        upstream_sha="$(manifest_top_field "$ujson" installed_sha)"
    fi

    # Sha-only compare: an upgrade is available when the upstream HEAD sha
    # differs from the locally recorded installed_sha. File-level drift on
    # overlapping paths is reported by `plan`, not here.
    local kind
    if [ -n "$upstream_sha" ] && [ "$upstream_sha" = "$LOCAL_INSTALLED_SHA" ]; then
        kind="up_to_date"
    else
        kind="upgrade_available"
    fi

    if [ "$FLAG_FORMAT" = "json" ]; then
        emit_status_json "$kind" "$upstream_sha" ""
    else
        emit_status_text "$kind" "$upstream_sha" ""
    fi
    return 0
}

cmd_plan() {
    parse_common_flags "$@" || return 40

    if ! require_git_working_tree; then
        log_error "$GIT_PREFLIGHT_REASON"
        return 40
    fi

    if ! load_local_manifest; then
        log_error "local bundle manifest missing or malformed: $LOCAL_MANIFEST_PATH"
        return 40
    fi
    resolve_upstream "$FLAG_SOURCE" "$FLAG_REF"

    local utree
    if ! utree="$(fetch_upstream_tree)"; then
        return 40
    fi

    local upstream_manifest="$utree/.github/dudestuff/bundle-manifest.md"
    if [ ! -f "$upstream_manifest" ]; then
        log_error "upstream tree is missing .github/dudestuff/bundle-manifest.md"
        return 40
    fi
    local ujson
    ujson="$(extract_manifest_json "$upstream_manifest")"
    if [ -z "$ujson" ]; then
        log_error "upstream manifest has no fenced JSON block"
        return 40
    fi
    local validation
    if ! validation="$(validate_upstream_manifest "$ujson")"; then
        log_error "upstream manifest invalid:"
        printf '%s\n' "$validation" | sed 's/^/  /' >&2
        return 40
    fi

    # Validate that the basic upstream layout is intact.
    local need
    for need in \
        ".github/agents" \
        ".github/skills/dude-lint" \
        ".github/instructions/dude.instructions.md" \
        ".github/dudestuff/bundle-manifest.md"
    do
        if [ ! -e "$utree/$need" ]; then
            log_error "upstream tree is missing required path: $need"
            return 40
        fi
    done

    classify_plan "$utree"

    # Prefer the fetched tree's HEAD sha; fall back to the upstream manifest's
    # installed_sha when git is unavailable.
    local upstream_sha
    upstream_sha="$(tree_head_sha "$utree")"
    [ -z "$upstream_sha" ] && upstream_sha="$(manifest_top_field "$ujson" installed_sha)"
    local from_sha="$LOCAL_INSTALLED_SHA"
    local created_at
    created_at="$(iso_now)"
    local stamp
    stamp="$(stamp_now)"
    local plan_id="${stamp}-$(short_sha "$from_sha")-$(short_sha "$upstream_sha")"

    mkdir -p "$PLANS_DIR"
    local plan_path="$PLANS_DIR/${plan_id}.json"

    local ttl_warn ttl_expire
    ttl_warn="$(iso_plus_seconds 3600)"
    ttl_expire="$(iso_plus_seconds 86400)"

    # Always persist JSON to the plans cache so apply (Ship 2) can find it.
    emit_plan_json "$plan_id" "$from_sha" "$upstream_sha" "$utree" \
        "$created_at" "$ttl_warn" "$ttl_expire" >"$plan_path"

    # Optional explicit --out copy.
    if [ -n "$FLAG_OUT" ]; then
        cp "$plan_path" "$FLAG_OUT"
    fi

    # Emit to stdout in the requested format.
    if [ "$FLAG_FORMAT" = "json" ]; then
        cat "$plan_path"
    else
        emit_plan_text "$plan_id" "$from_sha" "$upstream_sha" "$utree"
        printf '\nPlan saved: %s\n' "$plan_path"
    fi

    # Exit code precedence: up-to-date / changes detected.
    local n_replace n_add n_remove
    n_replace="$(count_lines_tsv "$CLS_REPLACE")"
    n_add="$(count_lines_tsv "$CLS_ADD")"
    n_remove="$(count_lines_tsv "$CLS_REMOVE")"

    if [ $((n_replace + n_add + n_remove)) -eq 0 ]; then
        return 0
    fi
    return 10
}

# ----- apply + rollback ------------------------------------------------------

# Apply-specific globals.
FLAG_PLAN=""
FLAG_CONFIRM=""
FLAG_SKIP_REMOVALS=""
FLAG_ALLOW_DIRTY=""
FLAG_TAG=""

# Plan-load globals populated by load_plan.
PLAN_JSON_PATH=""
PLAN_ID=""
PLAN_FROM_SHA=""
PLAN_TO_SHA=""
PLAN_CACHE_DIR=""
PLAN_SOURCE=""
PLAN_REF=""
PLAN_CREATED_AT=""
PLAN_TTL_EXPIRE=""

parse_apply_flags() {
    FLAG_FORMAT="text"
    FLAG_PLAN=""
    FLAG_CONFIRM=""
    FLAG_SKIP_REMOVALS=""
    FLAG_ALLOW_DIRTY=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --plan)              FLAG_PLAN="${2:-}"; shift 2 ;;
            --plan=*)            FLAG_PLAN="${1#--plan=}"; shift ;;
            --confirm)           FLAG_CONFIRM="${2:-}"; shift 2 ;;
            --confirm=*)         FLAG_CONFIRM="${1#--confirm=}"; shift ;;
            --skip-removals)     FLAG_SKIP_REMOVALS="1"; shift ;;
            --allow-dirty)       FLAG_ALLOW_DIRTY="1"; shift ;;
            --format)            FLAG_FORMAT="${2:-}"; shift 2 ;;
            --format=*)          FLAG_FORMAT="${1#--format=}"; shift ;;
            *) log_error "unknown flag: $1"; return 40 ;;
        esac
    done
    case "$FLAG_FORMAT" in
        text|json) ;;
        *) log_error "invalid --format: $FLAG_FORMAT (expected text|json)"; return 40 ;;
    esac
    return 0
}

parse_rollback_flags() {
    FLAG_FORMAT="text"
    FLAG_TAG=""
    FLAG_ALLOW_DIRTY=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --tag)            FLAG_TAG="${2:-}"; shift 2 ;;
            --tag=*)          FLAG_TAG="${1#--tag=}"; shift ;;
            --allow-dirty)    FLAG_ALLOW_DIRTY="1"; shift ;;
            --format)         FLAG_FORMAT="${2:-}"; shift 2 ;;
            --format=*)       FLAG_FORMAT="${1#--format=}"; shift ;;
            *) log_error "unknown flag: $1"; return 40 ;;
        esac
    done
    case "$FLAG_FORMAT" in
        text|json) ;;
        *) log_error "invalid --format: $FLAG_FORMAT (expected text|json)"; return 40 ;;
    esac
    return 0
}

# resolve_plan_path <arg> — accept either an absolute/relative path or a
# plan_id (looked up under $PLANS_DIR/<id>.json). Prints the resolved path.
resolve_plan_path() {
    local arg="$1"
    if [ -f "$arg" ]; then
        printf '%s\n' "$arg"; return 0
    fi
    if [ -f "$PLANS_DIR/$arg.json" ]; then
        printf '%s\n' "$PLANS_DIR/$arg.json"; return 0
    fi
    return 1
}

# load_plan <path> — extract top-level fields from a persisted plan JSON.
# The classification buckets are NOT read back; apply re-runs classify_plan
# against PLAN_CACHE_DIR for symmetry with `plan`.
load_plan() {
    local p="$1"
    PLAN_JSON_PATH="$p"
    PLAN_ID="$(awk -F'"' '/^[[:space:]]*"plan_id"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_FROM_SHA="$(awk -F'"' '/^[[:space:]]*"from_sha"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_TO_SHA="$(awk -F'"' '/^[[:space:]]*"to_sha"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_CACHE_DIR="$(awk -F'"' '/^[[:space:]]*"cache_dir"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_SOURCE="$(awk -F'"' '/^[[:space:]]*"source"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_REF="$(awk -F'"' '/^[[:space:]]*"ref"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_CREATED_AT="$(awk -F'"' '/^[[:space:]]*"created_at"[[:space:]]*:/ {print $4; exit}' "$p")"
    PLAN_TTL_EXPIRE="$(awk -F'"' '/^[[:space:]]*"ttl_expire_at"[[:space:]]*:/ {print $4; exit}' "$p")"
    if [ -z "$PLAN_TO_SHA" ] || [ -z "$PLAN_CACHE_DIR" ]; then
        return 1
    fi
    return 0
}

# iso_to_epoch <iso-8601> — print unix epoch, return non-zero on parse failure.
iso_to_epoch() {
    local iso="$1"
    if date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null; then
        return 0
    fi
    if date -u -d "$iso" +%s 2>/dev/null; then
        return 0
    fi
    return 1
}

# write_manifest <source_repo> <source_ref> <installed_sha> <installed_at>
# Rewrites only the fenced ```json ... ``` block in $LOCAL_MANIFEST_PATH,
# preserving the surrounding markdown wrapper. The manifest is metadata
# only. Base ownership is derived from the namespace convention by the
# engine.
write_manifest() {
    local source_repo="$1" source_ref="$2" installed_sha="$3"
    local installed_at="$4"

    mkdir -p "$CACHE_ROOT"
    local tmp
    tmp="$(mktemp -d "$CACHE_ROOT/manifest-rewrite-XXXXXX")"
    : >"$tmp/pre"
    : >"$tmp/post"

    awk -v pre="$tmp/pre" -v post="$tmp/post" '
        BEGIN { state = 0 }   # 0 = before json fence; 1 = inside; 2 = after
        /^```json[[:space:]]*$/ && state == 0 { print > pre; state = 1; next }
        /^```[[:space:]]*$/     && state == 1 { print > post; state = 2; next }
        state == 0 { print > pre }
        state == 2 { print > post }
    ' "$LOCAL_MANIFEST_PATH"

    {
        cat "$tmp/pre"
        printf '{\n'
        printf '  "source_repo": %s,\n'    "$(json_str "$source_repo")"
        printf '  "source_ref": %s,\n'     "$(json_str "$source_ref")"
        printf '  "installed_sha": %s,\n'  "$(json_str "$installed_sha")"
        printf '  "installed_at": %s\n'    "$(json_str "$installed_at")"
        printf '}\n'
        cat "$tmp/post"
    } >"$LOCAL_MANIFEST_PATH.tmp"
    mv "$LOCAL_MANIFEST_PATH.tmp" "$LOCAL_MANIFEST_PATH"
    rm -rf "$tmp"
}

emit_apply_text() {
    local safety_tag="$1" branch="$2"
    local replaced="$3" added="$4" removed="$5"
    local rem_deferred="$6"
    local lint="$7" from_sha="$8" to_sha="$9"

    printf 'Applied: %s -> %s\n' "$(short_sha "$from_sha")" "$(short_sha "$to_sha")"
    printf '  replaced:             %s\n' "$replaced"
    printf '  added:                %s\n' "$added"
    printf '  removed:              %s\n' "$removed"
    printf '  removals deferred:    %s\n' "$rem_deferred"
    printf '  safety tag:           %s\n' "$safety_tag"
    printf '  upgrade branch:       %s\n' "$branch"
    printf '  lint:                 [%s]\n' "$lint"
    printf '\n'
    printf 'Review:  git diff <target-branch>...%s\n' "$branch"
    printf 'Rollback: bash .github/skills/dude-bundle-upgrade/upgrade.sh rollback --tag %s\n' "$safety_tag"
}

emit_apply_json() {
    local safety_tag="$1" branch="$2"
    local replaced="$3" added="$4" removed="$5"
    local rem_deferred="$6"
    local lint="$7" from_sha="$8" to_sha="$9"

    printf '{\n'
    printf '  "status": "applied",\n'
    printf '  "from_sha": %s,\n'      "$(json_str "$from_sha")"
    printf '  "to_sha": %s,\n'        "$(json_str "$to_sha")"
    printf '  "safety_tag": %s,\n'    "$(json_str "$safety_tag")"
    printf '  "upgrade_branch": %s,\n' "$(json_str "$branch")"
    printf '  "counts": {\n'
    printf '    "replaced": %s,\n'             "$(json_num "$replaced")"
    printf '    "added": %s,\n'                "$(json_num "$added")"
    printf '    "removed": %s,\n'              "$(json_num "$removed")"
    printf '    "removals_deferred": %s\n'     "$(json_num "$rem_deferred")"
    printf '  },\n'
    printf '  "lint": %s\n'           "$(json_str "$lint")"
    printf '}\n'
}

cmd_apply() {
    parse_apply_flags "$@" || return 40

    if ! require_git_working_tree; then
        log_error "$GIT_PREFLIGHT_REASON"
        return 40
    fi

    if [ -z "$FLAG_PLAN" ]; then
        log_error "--plan is required (path or plan id)"
        return 40
    fi
    if [ -z "$FLAG_CONFIRM" ]; then
        log_error "--confirm is required (use 'confirm-upgrade')"
        return 40
    fi
    if [ "$FLAG_CONFIRM" != "confirm-upgrade" ]; then
        log_error "invalid --confirm token: $FLAG_CONFIRM (expected literal string 'confirm-upgrade')"
        return 40
    fi

    if ! load_local_manifest; then
        log_error "local bundle manifest missing or malformed: $LOCAL_MANIFEST_PATH"
        return 40
    fi

    local plan_path
    if ! plan_path="$(resolve_plan_path "$FLAG_PLAN")"; then
        log_error "plan not found: $FLAG_PLAN"
        return 40
    fi
    if ! load_plan "$plan_path"; then
        log_error "plan file malformed: $plan_path"
        return 40
    fi

    if [ "$PLAN_FROM_SHA" != "$LOCAL_INSTALLED_SHA" ]; then
        log_error "plan from_sha ($PLAN_FROM_SHA) does not match local installed_sha ($LOCAL_INSTALLED_SHA)"
        log_error "re-run 'plan' to generate a fresh plan"
        return 40
    fi

    if [ ! -d "$PLAN_CACHE_DIR" ]; then
        log_error "plan cache_dir missing: $PLAN_CACHE_DIR"
        log_error "the upstream tree may have been cleaned; re-run 'plan'"
        return 40
    fi

    if [ -n "$PLAN_TTL_EXPIRE" ]; then
        local now_epoch expire_epoch
        now_epoch="$(date -u +%s)"
        if expire_epoch="$(iso_to_epoch "$PLAN_TTL_EXPIRE")"; then
            if [ "$now_epoch" -gt "$expire_epoch" ]; then
                log_error "plan expired (created $PLAN_CREATED_AT, expired $PLAN_TTL_EXPIRE)"
                log_error "re-run 'plan' to generate a fresh plan"
                return 40
            fi
        fi
    fi

    if [ -z "$FLAG_ALLOW_DIRTY" ]; then
        if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
            log_error "working tree is dirty; commit/stash first, or pass --allow-dirty"
            return 40
        fi
    fi

    UPSTREAM_SOURCE="$PLAN_SOURCE"
    UPSTREAM_REF="$PLAN_REF"
    classify_plan "$PLAN_CACHE_DIR"

    local upstream_manifest="$PLAN_CACHE_DIR/.github/dudestuff/bundle-manifest.md"
    if [ ! -f "$upstream_manifest" ]; then
        log_error "plan cache missing upstream manifest at $upstream_manifest"
        return 40
    fi
    local n_replace n_add n_remove
    n_replace="$(count_lines_tsv "$CLS_REPLACE")"
    n_add="$(count_lines_tsv "$CLS_ADD")"
    n_remove="$(count_lines_tsv "$CLS_REMOVE")"

    if [ $((n_replace + n_add + n_remove)) -eq 0 ]; then
        log_info "nothing to apply (no changes)"
        return 0
    fi

    # ---- Safety net ----
    local safety_tag="dude-pre-upgrade-$(stamp_now)"
    local upgrade_branch="chore/dude-upgrade-$(short_sha "$PLAN_TO_SHA")"

    log_info "creating safety tag: $safety_tag"
    if ! git -C "$ROOT" tag "$safety_tag" 2>/dev/null; then
        log_error "failed to create safety tag: $safety_tag"
        return 40
    fi

    if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$upgrade_branch"; then
        upgrade_branch="${upgrade_branch}-$(stamp_now)"
    fi
    log_info "creating upgrade branch: $upgrade_branch"
    if ! git -C "$ROOT" checkout -b "$upgrade_branch" >/dev/null 2>&1; then
        log_error "failed to create upgrade branch: $upgrade_branch"
        git -C "$ROOT" tag -d "$safety_tag" >/dev/null 2>&1
        return 40
    fi

    # ---- Apply file operations ----
    local applied_paths=()
    local skipped_removes=()

    # Add
    while IFS= read -r p; do
        [ -z "$p" ] && continue
        log_debug "add: $p"
        mkdir -p "$ROOT/$(dirname "$p")"
        cp "$PLAN_CACHE_DIR/$p" "$ROOT/$p"
        applied_paths+=("$p")
    done <<<"$CLS_ADD"

    # Replace (TSV: path\tplus\tminus)
    while IFS=$'\t' read -r p _plus _minus; do
        [ -z "$p" ] && continue
        log_debug "replace: $p"
        mkdir -p "$ROOT/$(dirname "$p")"
        cp "$PLAN_CACHE_DIR/$p" "$ROOT/$p"
        applied_paths+=("$p")
    done <<<"$CLS_REPLACE"

    # Remove
    if [ -n "$FLAG_SKIP_REMOVALS" ]; then
        while IFS= read -r p; do
            [ -z "$p" ] && continue
            skipped_removes+=("$p")
        done <<<"$CLS_REMOVE"
    else
        while IFS= read -r p; do
            [ -z "$p" ] && continue
            log_debug "remove: $p"
            rm -f "$ROOT/$p"
            applied_paths+=("$p")
        done <<<"$CLS_REMOVE"
    fi

    # ---- Rewrite manifest (metadata-only) ----
    write_manifest \
        "$PLAN_SOURCE" \
        "$PLAN_REF" \
        "$PLAN_TO_SHA" \
        "$(iso_now)"

    # ---- Append upgrade-log entry (lint marker patched in below) ----
    local log_path="$ROOT/.github/dudestuff/upgrade-log.md"
    local actual_removed=$((n_remove - ${#skipped_removes[@]}))
    {
        printf '\n## %s — upgrade\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"
        printf -- '- from: %s\n' "$PLAN_FROM_SHA"
        printf -- '- to:   %s\n' "$PLAN_TO_SHA"
        printf -- '- ref:  %s\n' "$PLAN_REF"
        printf -- '- replaced: %s\n' "$n_replace"
        printf -- '- added:    %s\n' "$n_add"
        printf -- '- removed:  %s\n' "$actual_removed"
        printf -- '- removals_deferred:   %s\n' "${#skipped_removes[@]}"
        printf -- '- preserved: project files outside the base namespace\n'
        printf -- '- safety tag: %s\n' "$safety_tag"
        printf -- '- lint: __LINT_RESULT__\n'
        printf -- '- notes: plan_id=%s; branch=%s\n' "$PLAN_ID" "$upgrade_branch"
    } >>"$log_path"

    # ---- Run lint ----
    local lint_result="OK"
    local lint_path="$ROOT/.github/skills/dude-lint/lint.sh"
    if [ -f "$lint_path" ]; then
        if bash "$lint_path" >/dev/null 2>&1; then
            lint_result="OK"
        else
            lint_result="FAIL"
        fi
    else
        lint_result="SKIPPED"
    fi
    # Patch the placeholder in the just-appended log entry (last occurrence only).
    if [ "$(uname -s)" = "Darwin" ]; then
        sed -i '' "s|__LINT_RESULT__|[$lint_result]|" "$log_path"
    else
        sed -i "s|__LINT_RESULT__|[$lint_result]|" "$log_path"
    fi

    # ---- Stage + commit on upgrade branch ----
    # Stage manifest + log + every applied path (`git add -A <path>` handles
    # deletions). Commit best-effort; if there's nothing to commit (rare),
    # log a warning rather than failing.
    git -C "$ROOT" add -A \
        ".github/dudestuff/bundle-manifest.md" \
        ".github/dudestuff/upgrade-log.md" >/dev/null 2>&1 || true
    local p
    for p in "${applied_paths[@]}"; do
        git -C "$ROOT" add -A "$p" >/dev/null 2>&1 || true
    done

    local commit_msg="chore: upgrade Dude bundle to $(short_sha "$PLAN_TO_SHA")"
    if ! git -C "$ROOT" commit -q -m "$commit_msg" >/dev/null 2>&1; then
        log_warn "git commit produced no changes or failed (manifest/log written; review with 'git status')"
    fi

    # ---- Report ----
    if [ "$FLAG_FORMAT" = "json" ]; then
        emit_apply_json "$safety_tag" "$upgrade_branch" \
            "$n_replace" "$n_add" "$actual_removed" \
            "${#skipped_removes[@]}" \
            "$lint_result" "$PLAN_FROM_SHA" "$PLAN_TO_SHA"
    else
        emit_apply_text "$safety_tag" "$upgrade_branch" \
            "$n_replace" "$n_add" "$actual_removed" \
            "${#skipped_removes[@]}" \
            "$lint_result" "$PLAN_FROM_SHA" "$PLAN_TO_SHA"
    fi

    if [ "$lint_result" = "FAIL" ]; then
        log_error "post-apply lint reported failures; review and consider 'rollback --tag $safety_tag'"
        return 40
    fi
    return 0
}

cmd_rollback() {
    parse_rollback_flags "$@" || return 40

    if ! require_git_working_tree; then
        log_error "$GIT_PREFLIGHT_REASON"
        return 40
    fi

    if [ -z "$FLAG_ALLOW_DIRTY" ]; then
        if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
            log_error "working tree is dirty; commit/stash first, or pass --allow-dirty"
            return 40
        fi
    fi

    local tag="$FLAG_TAG"
    if [ -z "$tag" ]; then
        tag="$(git -C "$ROOT" tag --list 'dude-pre-upgrade-*' --sort=-creatordate 2>/dev/null | head -n 1)"
        if [ -z "$tag" ]; then
            log_error "no dude-pre-upgrade-* tag found; nothing to rollback to"
            return 40
        fi
    fi
    if ! git -C "$ROOT" rev-parse --verify "$tag" >/dev/null 2>&1; then
        log_error "tag not found: $tag"
        return 40
    fi

    local restored_sha
    restored_sha="$(git -C "$ROOT" rev-parse "$tag")"
    local current_branch
    current_branch="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"

    log_info "resetting $current_branch to safety tag: $tag ($(short_sha "$restored_sha"))"
    if ! git -C "$ROOT" reset --hard "$tag" >/dev/null 2>&1; then
        log_error "git reset --hard $tag failed"
        return 40
    fi

    # Append rollback entry (uncommitted; user can commit or discard).
    local log_path="$ROOT/.github/dudestuff/upgrade-log.md"
    if [ -f "$log_path" ]; then
        {
            printf '\n## %s — rollback\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"
            printf -- '- restored: %s\n' "$restored_sha"
            printf -- '- safety tag: %s\n' "$tag"
            printf -- '- branch: %s\n' "$current_branch"
            printf -- '- notes: appended uncommitted; commit or discard as desired\n'
        } >>"$log_path"
    fi

    local lint_result="OK"
    local lint_path="$ROOT/.github/skills/dude-lint/lint.sh"
    if [ -f "$lint_path" ]; then
        if ! bash "$lint_path" >/dev/null 2>&1; then
            lint_result="FAIL"
        fi
    fi

    if [ "$FLAG_FORMAT" = "json" ]; then
        printf '{\n'
        printf '  "status": "rolled_back",\n'
        printf '  "tag": %s,\n'           "$(json_str "$tag")"
        printf '  "restored_sha": %s,\n'  "$(json_str "$restored_sha")"
        printf '  "branch": %s,\n'        "$(json_str "$current_branch")"
        printf '  "lint": %s\n'           "$(json_str "$lint_result")"
        printf '}\n'
    else
        printf 'Rolled back %s to %s (%s)\n' "$current_branch" "$tag" "$(short_sha "$restored_sha")"
        printf 'Lint: [%s]\n' "$lint_result"
        printf 'Note: rollback log entry appended uncommitted; review and commit if desired.\n'
    fi
    return 0
}

# ----- main dispatch ---------------------------------------------------------

main() {
    if [ $# -lt 1 ]; then
        cmd_help
        return 40
    fi
    local sub="$1"; shift
    case "$sub" in
        status)    cmd_status "$@" ;;
        plan)      cmd_plan "$@" ;;
        apply)     cmd_apply "$@" ;;
        rollback)  cmd_rollback "$@" ;;
        help|-h|--help) cmd_help ;;
        *)
            log_error "unknown subcommand: $sub"
            cmd_help
            return 40
            ;;
    esac
}

main "$@"
exit $?
