// @ts-check
/**
 * Release-channel resolution shared by dude-bundle-upgrade and dude-compose.
 *
 * A bundle manifest's `source_ref` may be the sentinel `latest` — the release
 * channel — or a concrete tag/branch. On the `latest` channel both the upgrade
 * engine (core refresh) and the pack-catalog fetch resolve to the newest stable
 * `vX.Y.Z` tag on the source. Keeping this in one place stops the two callers
 * from drifting on what `latest` means.
 *
 * Dependency-free ESM (node:* only). Targets Node >= 20; git is required to
 * enumerate tags on a source.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/** The manifest `source_ref` sentinel that selects the release channel. */
export const RELEASE_CHANNEL = 'latest';
const RELEASE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** @param {string} p @returns {boolean} */
function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
/** @returns {boolean} */
function hasGit() {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Pick the newest stable release tag (highest `vX.Y.Z` by numeric semver;
 * pre-release tags such as `v1.0.0-rc1` are ignored) from a list of tag names.
 * @param {string[]} tagNames
 * @returns {string | null}
 */
export function pickLatestReleaseTag(tagNames) {
  /** @type {[number, number, number, string] | null} */
  let best = null;
  for (const raw of tagNames) {
    const name = String(raw).trim();
    const m = RELEASE_TAG_RE.exec(name);
    if (!m) continue;
    const maj = Number(m[1]);
    const min = Number(m[2]);
    const pat = Number(m[3]);
    if (
      best === null ||
      maj > best[0] ||
      (maj === best[0] && min > best[1]) ||
      (maj === best[0] && min === best[1] && pat > best[2])
    ) {
      best = [maj, min, pat, name];
    }
  }
  return best ? best[3] : null;
}

/**
 * List candidate release tag names for a source (remote URL or local path).
 * @param {string} source
 * @returns {string[]}
 */
export function listReleaseTags(source) {
  if (!hasGit()) return [];
  if (isDir(source)) {
    const r = spawnSync('git', ['tag', '--list', 'v*'], { cwd: source, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  }
  const r = spawnSync('git', ['ls-remote', '--tags', '--refs', source], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  /** @type {string[]} */
  const names = [];
  for (const line of r.stdout.split('\n')) {
    const m = /refs\/tags\/(\S+)$/.exec(line.trim());
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * Resolve a manifest `source_ref` to the concrete git ref to fetch.
 *
 * The `latest` channel resolves to the newest stable `vX.Y.Z` tag — but only for
 * **remote** sources. A local-path source is used in place (its working tree),
 * so its ref stays literal and callers must not claim a resolved tag for it. A
 * concrete tag or branch is always returned unchanged.
 *
 * @param {string} source repo URL or local path
 * @param {string} ref manifest `source_ref`
 * @returns {{ ref: string, channel: boolean, resolvedRef: string }}
 *   `channel` is true only when the `latest` sentinel was resolved against a
 *   remote source; `resolvedRef` is then the concrete tag (or '' when no release
 *   exists yet). Otherwise `resolvedRef` is the literal `ref`.
 */
export function resolveReleaseRef(source, ref) {
  if (ref !== RELEASE_CHANNEL || isDir(source)) {
    return { ref, channel: false, resolvedRef: ref };
  }
  const tag = pickLatestReleaseTag(listReleaseTags(source));
  return { ref, channel: true, resolvedRef: tag || '' };
}
