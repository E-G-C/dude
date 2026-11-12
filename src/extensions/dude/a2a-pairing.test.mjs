// @ts-check
/**
 * The standing-pairing record helper against real disposable folders under
 * the OS temporary directory, outside any workspace or Git checkout. Links
 * are created where this host allows them; a case that cannot create one says
 * so through a test diagnostic. A real read denial uses icacls on Windows and
 * chmod elsewhere. Faults a disk cannot produce on demand are injected into
 * one `fs` function for one synchronous helper call and restored before
 * anything is asserted.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PairingError, pairingPath, readPairing, writePairing } from './lib/a2a-pairing.mjs';

/** @param {string} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const FIRST = sha256('first approved binding');
const SECOND = sha256('second approved binding');
/** @param {string} digest */
const recordText = (digest) => `{"version":1,"bindingSha256":"${digest}"}\n`;

/** @type {string[]} */
const temporaryDirectories = [];
after(() => {
  for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
});

/** @param {string} target */
function present(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * A disposable canonical base under the OS temporary directory, holding a
 * workspace and a separate owner folder with the configuration file.
 */
function owner() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-pairing-')));
  temporaryDirectories.push(base);
  for (let directory = base; ; directory = path.dirname(directory)) {
    assert.equal(present(path.join(directory, '.git')), false, `these tests need an OS temporary directory outside every Git checkout: ${directory}`);
    if (path.dirname(directory) === directory) break;
  }
  const workspace = path.join(base, 'workspace');
  const external = path.join(base, 'owner');
  fs.mkdirSync(workspace);
  fs.mkdirSync(external);
  const config = path.join(external, 'a2a.json');
  fs.writeFileSync(config, '{"profiles":{}}\n');
  return { base, workspace, external, config, folder: `${config}.pairings`, record: pairingPath(config, 'b-serve') };
}

/**
 * Assert that `action` refuses with `code` and that its message repeats none of `hidden`.
 * @param {() => unknown} action @param {string} code @param {string} label @param {string[]} [hidden]
 */
function refuses(action, code, label, hidden = []) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof PairingError, `${label}: a PairingError`);
    assert.equal(error.code, code, label);
    for (const text of hidden) assert.equal(error.message.includes(text), false, `${label}: the message repeats no path or content`);
    return true;
  }, label);
}

/**
 * Run one synchronous helper call with `fs` functions replaced, restoring them before returning.
 * @template T
 * @param {Record<string, (original: Function) => Function>} replacements @param {() => T} action
 */
function withFaults(replacements, action) {
  const module = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (fs));
  const originals = Object.fromEntries(Object.keys(replacements).map((name) => [name, module[name]]));
  for (const [name, replace] of Object.entries(replacements)) module[name] = replace(originals[name]);
  try {
    return action();
  } finally {
    for (const [name, original] of Object.entries(originals)) module[name] = original;
  }
}

/** @param {string} code @param {string} syscall */
function fault(code, syscall) {
  return Object.assign(new Error(`${code}: injected ${syscall} failure`), { code, syscall });
}

/**
 * Link `link` to the folder `target`: a junction on Windows, which needs no
 * privilege, else a symbolic link. Returns why this host could not, or null.
 * @param {string} target @param {string} link
 */
function linkFolder(target, link) {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return null;
  } catch (error) {
    return `${/** @type {NodeJS.ErrnoException} */ (error).code ?? 'error'}: ${/** @type {Error} */ (error).message}`;
  }
}

/**
 * Deny this user reading `file`'s content for real, or say why this host cannot.
 * @param {string} file
 * @returns {{restore: () => void, unavailable?: undefined} | {unavailable: string}}
 */
function denyRead(file) {
  let restore = () => undefined;
  try {
    if (process.platform === 'win32') {
      const icacls = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe');
      const name = os.userInfo().username;
      const user = process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${name}` : name;
      execFileSync(icacls, [file, '/deny', `${user}:(RD)`], { stdio: 'ignore' });
      restore = () => { execFileSync(icacls, [file, '/remove:d', user], { stdio: 'ignore' }); };
    } else {
      if (process.getuid?.() === 0) return { unavailable: 'this process runs as root, which reads any file' };
      fs.chmodSync(file, 0o000);
      restore = () => fs.chmodSync(file, 0o600);
    }
  } catch (error) {
    return { unavailable: /** @type {Error} */ (error).message };
  }
  try {
    fs.closeSync(fs.openSync(file, 'r'));
  } catch {
    return { restore };
  }
  restore();
  return { unavailable: 'the denial did not stop this user reading the file' };
}

test('a record path is a pure sibling of the canonical configuration, named only by the exact profile ID hash', () => {
  const dirs = owner();
  assert.equal(dirs.record, path.join(`${dirs.config}.pairings`, `${sha256('b-serve')}.json`));
  assert.equal(pairingPath(dirs.config, 'b-serve'), dirs.record, 'deterministic');
  // Letter case and a trailing dot would collide as Windows file names; their hashes do not.
  const ids = ['b-serve', 'B-serve', 'B-SERVE', 'b-serve.', 'b_serve'];
  const names = ids.map((id) => path.basename(pairingPath(dirs.config, id)));
  for (const name of names) assert.match(name, /^[0-9a-f]{64}\.json$/, 'the file name is the ID hash alone');
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, ids.length, 'every exact ID keeps its own file');
  assert.equal(present(dirs.folder), false, 'deriving paths creates nothing');
});

test('a missing record or folder reads as absent and creates nothing', () => {
  const dirs = owner();
  assert.equal(readPairing(dirs.record, dirs.workspace), null, 'no folder yet');
  assert.equal(present(dirs.folder), false, 'reading creates nothing');
  fs.mkdirSync(dirs.folder);
  assert.equal(readPairing(dirs.record, dirs.workspace), null, 'an empty folder');
  writePairing(pairingPath(dirs.config, 'a-ask'), dirs.workspace, FIRST);
  assert.equal(readPairing(dirs.record, dirs.workspace), null, "another profile's record is not this profile's");
});

test('a saved record is exactly the closed two-field object, replaced whole, owner-only where modes apply, and leaves no temporary file', (context) => {
  const dirs = owner();
  writePairing(dirs.record, dirs.workspace, FIRST);
  assert.equal(readPairing(dirs.record, dirs.workspace), FIRST);
  const stored = fs.readFileSync(dirs.record, 'utf8');
  assert.equal(stored, recordText(FIRST), 'exactly the closed record');
  for (const text of ['b-serve', dirs.base, 'a2a.json']) assert.equal(stored.includes(text), false, 'no profile ID or path');
  assert.deepEqual(fs.readdirSync(dirs.folder), [path.basename(dirs.record)], 'no temporary file remains');
  writePairing(dirs.record, dirs.workspace, SECOND);
  assert.equal(readPairing(dirs.record, dirs.workspace), SECOND);
  assert.equal(fs.readFileSync(dirs.record, 'utf8'), recordText(SECOND));
  assert.deepEqual(fs.readdirSync(dirs.folder), [path.basename(dirs.record)], 'a replacement leaves one record');
  if (process.platform === 'win32') {
    context.diagnostic('owner-only modes not asserted: Windows applies the folder ACLs it inherits, not POSIX modes');
  } else {
    assert.equal(fs.statSync(dirs.folder).mode & 0o077, 0, 'the created folder is owner-only');
    assert.equal(fs.statSync(dirs.record).mode & 0o077, 0, 'the record is owner-only');
  }
});

test('only a lowercase SHA-256 digest is ever written', () => {
  const dirs = owner();
  for (const value of [FIRST.toUpperCase(), FIRST.slice(1), `${FIRST}0`, `sha256:${FIRST}`, '', 42, null, undefined]) {
    refuses(() => writePairing(dirs.record, dirs.workspace, /** @type {any} */ (value)), 'pairing_invalid', `digest ${String(value)}`);
  }
  assert.equal(present(dirs.folder), false, 'a refused write creates nothing');
});

test('malformed records refuse as invalid without echoing their content', () => {
  const dirs = owner();
  fs.mkdirSync(dirs.folder);
  const marker = 'PRIVATE-RECORD-CONTENT';
  for (const [label, content] of /** @type {Array<[string, string | Buffer]>} */ ([
    ['an empty file', ''],
    ['text that is not JSON', `${marker} is not JSON`],
    ['invalid UTF-8', Buffer.from([0x7b, 0xc3, 0x28, 0x7d])],
    ['an array', `["${marker}"]`],
    ['null', 'null'],
    ['a string', `"${marker}"`],
    ['an unknown key', JSON.stringify({ version: 1, bindingSha256: FIRST, note: marker })],
    ['a missing digest', JSON.stringify({ version: 1 })],
    ['a missing version', JSON.stringify({ bindingSha256: FIRST })],
    ['another version', JSON.stringify({ version: 2, bindingSha256: FIRST })],
    ['a text version', JSON.stringify({ version: '1', bindingSha256: FIRST })],
    ['an uppercase digest', JSON.stringify({ version: 1, bindingSha256: FIRST.toUpperCase() })],
    ['a short digest', JSON.stringify({ version: 1, bindingSha256: FIRST.slice(1) })],
    ['a prefixed digest', JSON.stringify({ version: 1, bindingSha256: `sha256:${FIRST}` })],
    ['a numeric digest', JSON.stringify({ version: 1, bindingSha256: 1 })],
  ])) {
    fs.writeFileSync(dirs.record, content);
    refuses(() => readPairing(dirs.record, dirs.workspace), 'pairing_invalid', label, [marker, dirs.base, FIRST]);
  }
});

test('the 1 KiB bound is inclusive: 1024 bytes read, while 1025 bytes refuse rather than truncate', () => {
  const dirs = owner();
  fs.mkdirSync(dirs.folder);
  const compact = recordText(FIRST).trimEnd();
  fs.writeFileSync(dirs.record, compact.padEnd(1024, ' '));
  assert.equal(fs.statSync(dirs.record).size, 1024);
  assert.equal(readPairing(dirs.record, dirs.workspace), FIRST, 'exactly 1024 bytes is within the bound');
  fs.writeFileSync(dirs.record, compact.padEnd(1025, ' '));
  refuses(() => readPairing(dirs.record, dirs.workspace), 'pairing_invalid', '1025 bytes, whose first 1024 alone would parse');
  fs.writeFileSync(dirs.record, `${compact}${' '.repeat(1024 * 1024)}`);
  refuses(() => readPairing(dirs.record, dirs.workspace), 'pairing_invalid', 'a much larger file');
});

test('a linked or non-regular record or folder refuses reads and writes and is left unchanged', (context) => {
  const folderRecord = owner();
  fs.mkdirSync(folderRecord.record, { recursive: true });
  refuses(() => readPairing(folderRecord.record, folderRecord.workspace), 'pairing_unsafe', 'a folder at the record path');
  refuses(() => writePairing(folderRecord.record, folderRecord.workspace, FIRST), 'pairing_unsafe', 'writing over a folder');
  assert.ok(fs.lstatSync(folderRecord.record).isDirectory());
  assert.deepEqual(fs.readdirSync(folderRecord.folder), [path.basename(folderRecord.record)], 'no temporary file was created');

  const fileFolder = owner();
  fs.writeFileSync(fileFolder.folder, 'not a folder\n');
  refuses(() => readPairing(fileFolder.record, fileFolder.workspace), 'pairing_unsafe', 'a file at the folder path');
  refuses(() => writePairing(fileFolder.record, fileFolder.workspace, FIRST), 'pairing_unsafe', 'writing below a file');
  assert.equal(fs.readFileSync(fileFolder.folder, 'utf8'), 'not a folder\n');

  const linkedRecord = owner();
  const elsewhere = path.join(linkedRecord.base, 'elsewhere.json');
  fs.writeFileSync(elsewhere, recordText(FIRST));
  fs.mkdirSync(linkedRecord.folder);
  try {
    fs.symlinkSync(elsewhere, linkedRecord.record, 'file');
  } catch (error) {
    context.diagnostic(`a linked record not run: this host cannot create a file link (${/** @type {Error} */ (error).message})`);
  }
  if (present(linkedRecord.record)) {
    refuses(() => readPairing(linkedRecord.record, linkedRecord.workspace), 'pairing_unsafe', 'a record that is a link to a valid record');
    refuses(() => writePairing(linkedRecord.record, linkedRecord.workspace, SECOND), 'pairing_unsafe', 'writing over a linked record');
    assert.ok(fs.lstatSync(linkedRecord.record).isSymbolicLink(), 'the link is kept');
    assert.equal(fs.readFileSync(elsewhere, 'utf8'), recordText(FIRST), 'its target is unchanged');
  }

  const linkedFolder = owner();
  const real = path.join(linkedFolder.base, 'real-pairings');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, path.basename(linkedFolder.record)), recordText(FIRST));
  const unavailable = linkFolder(real, linkedFolder.folder);
  if (unavailable) {
    context.diagnostic(`a linked pairing folder not run: ${unavailable}`);
  } else {
    refuses(() => readPairing(linkedFolder.record, linkedFolder.workspace), 'pairing_unsafe', 'a linked folder holding a valid record');
    refuses(() => writePairing(linkedFolder.record, linkedFolder.workspace, SECOND), 'pairing_unsafe', 'writing through a linked folder');
    assert.deepEqual(fs.readdirSync(real), [path.basename(linkedFolder.record)]);
    assert.equal(fs.readFileSync(path.join(real, path.basename(linkedFolder.record)), 'utf8'), recordText(FIRST), 'the linked record is unchanged');
  }
});

test('an unreadable record or location refuses rather than reading as absent', (context) => {
  const denied = owner();
  writePairing(denied.record, denied.workspace, FIRST);
  const denial = denyRead(denied.record);
  if (denial.unavailable !== undefined) {
    context.diagnostic(`a real read denial not run: ${denial.unavailable}`);
  } else {
    try {
      refuses(() => readPairing(denied.record, denied.workspace), 'pairing_unreadable', 'a record this user may not read', [denied.base]);
    } finally {
      denial.restore();
    }
    assert.equal(readPairing(denied.record, denied.workspace), FIRST, 'restoring access restores the same record');
  }

  const injected = owner();
  writePairing(injected.record, injected.workspace, FIRST);
  refuses(() => withFaults({
    openSync: (original) => function (/** @type {fs.PathLike} */ file, /** @type {unknown[]} */ ...rest) {
      if (path.basename(String(file)) === path.basename(injected.record)) throw fault('EACCES', 'open');
      return original.call(this, file, ...rest);
    },
  }, () => readPairing(injected.record, injected.workspace)), 'pairing_unreadable', 'an injected open failure');
  assert.equal(readPairing(injected.record, injected.workspace), FIRST);

  // A Git marker that cannot be probed is not evidence of its absence.
  const unprobed = owner();
  const probeFails = {
    lstatSync: (/** @type {Function} */ original) => function (/** @type {fs.PathLike} */ target, /** @type {unknown[]} */ ...rest) {
      if (path.basename(String(target)) === '.git') throw fault('EACCES', 'lstat');
      return original.call(this, target, ...rest);
    },
  };
  refuses(() => withFaults(probeFails, () => readPairing(unprobed.record, unprobed.workspace)), 'pairing_unreadable', 'an unprobeable location read');
  refuses(() => withFaults(probeFails, () => writePairing(unprobed.record, unprobed.workspace, FIRST)), 'pairing_unreadable',
    'an unprobeable location write');
  assert.equal(present(unprobed.folder), false, 'nothing was created');
});

test('storage inside the workspace or any Git checkout or worktree refuses, even outside the selected workspace and before any record exists', (context) => {
  /** @type {Array<[string, () => {record: string, workspace: string, folder: string, base: string} | null]>} */
  const cases = [
    ['a pairing folder inside the selected workspace', () => {
      const dirs = owner();
      return { ...dirs, workspace: dirs.external };
    }],
    ['a .git folder beside the configuration', () => {
      const dirs = owner();
      fs.mkdirSync(path.join(dirs.external, '.git'));
      return dirs;
    }],
    ['a .git folder on a higher ancestor, while the workspace is elsewhere', () => {
      const dirs = owner();
      fs.mkdirSync(path.join(dirs.base, 'repo', '.git'), { recursive: true });
      const config = path.join(dirs.base, 'repo', 'nested', 'owner', 'a2a.json');
      fs.mkdirSync(path.dirname(config), { recursive: true });
      fs.writeFileSync(config, '{"profiles":{}}\n');
      return { ...dirs, record: pairingPath(config, 'b-serve'), folder: `${config}.pairings` };
    }],
    ['a linked worktree .git file on an ancestor', () => {
      const dirs = owner();
      fs.mkdirSync(path.join(dirs.base, 'tree'));
      fs.writeFileSync(path.join(dirs.base, 'tree', '.git'), `gitdir: ${path.join(dirs.base, 'main', '.git', 'worktrees', 'tree')}\n`);
      const config = path.join(dirs.base, 'tree', 'owner', 'a2a.json');
      fs.mkdirSync(path.dirname(config));
      fs.writeFileSync(config, '{"profiles":{}}\n');
      return { ...dirs, record: pairingPath(config, 'b-serve'), folder: `${config}.pairings` };
    }],
    ['a .git marker inside the pairing folder itself', () => {
      const dirs = owner();
      fs.mkdirSync(path.join(dirs.folder, '.git'), { recursive: true });
      return dirs;
    }],
    ['a configuration folder linked from outside to a real location inside a checkout', () => {
      const dirs = owner();
      const inside = path.join(dirs.base, 'repo', 'owner');
      fs.mkdirSync(path.join(dirs.base, 'repo', '.git'), { recursive: true });
      fs.mkdirSync(inside);
      fs.writeFileSync(path.join(inside, 'a2a.json'), '{"profiles":{}}\n');
      const alias = path.join(dirs.base, 'alias');
      const unavailable = linkFolder(inside, alias);
      if (unavailable) {
        context.diagnostic(`a linked configuration folder not run: ${unavailable}`);
        return null;
      }
      const config = path.join(alias, 'a2a.json');
      return { ...dirs, record: pairingPath(config, 'b-serve'), folder: path.join(inside, 'a2a.json.pairings') };
    }],
  ];
  for (const [label, arrange] of cases) {
    const dirs = arrange();
    if (!dirs) continue;
    const before = present(dirs.folder) ? fs.readdirSync(dirs.folder) : null;
    refuses(() => readPairing(dirs.record, dirs.workspace), 'pairing_location', `${label}: read`, [dirs.base]);
    refuses(() => writePairing(dirs.record, dirs.workspace, FIRST), 'pairing_location', `${label}: write`, [dirs.base]);
    assert.deepEqual(present(dirs.folder) ? fs.readdirSync(dirs.folder) : null, before, `${label}: nothing was created`);
  }
});

test('every use checks the location again, so a valid record behind a swapped folder link or a new Git marker refuses', (context) => {
  const swapped = owner();
  writePairing(swapped.record, swapped.workspace, FIRST);
  assert.equal(readPairing(swapped.record, swapped.workspace), FIRST);
  fs.renameSync(swapped.folder, `${swapped.folder}-moved`);
  const unavailable = linkFolder(`${swapped.folder}-moved`, swapped.folder);
  if (unavailable) {
    context.diagnostic(`a folder swapped for a link not run: ${unavailable}`);
  } else {
    refuses(() => readPairing(swapped.record, swapped.workspace), 'pairing_unsafe', 'the same record now behind a link');
    refuses(() => writePairing(swapped.record, swapped.workspace, SECOND), 'pairing_unsafe', 'a write through the swapped link');
    assert.equal(fs.readFileSync(path.join(`${swapped.folder}-moved`, path.basename(swapped.record)), 'utf8'), recordText(FIRST));
  }

  const checkedOut = owner();
  writePairing(checkedOut.record, checkedOut.workspace, FIRST);
  fs.mkdirSync(path.join(checkedOut.base, '.git'));
  refuses(() => readPairing(checkedOut.record, checkedOut.workspace), 'pairing_location', 'a record whose location became a checkout');
  refuses(() => writePairing(checkedOut.record, checkedOut.workspace, SECOND), 'pairing_location', 'a write there');
  assert.equal(fs.readFileSync(checkedOut.record, 'utf8'), recordText(FIRST), 'the record itself is left for the owner to delete');
});

test("a failed replacement keeps the previous record and removes only that attempt's temporary file", () => {
  /** @type {Array<[string, Record<string, (original: Function) => Function>, RegExp]>} */
  const faults = [
    ['the rename fails', { renameSync: () => () => { throw fault('EIO', 'rename'); } }, /any previous record is unchanged$/],
    ['writing the temporary file fails', { writeFileSync: () => () => { throw fault('ENOSPC', 'write'); } }, /any previous record is unchanged$/],
    ['the temporary file cannot be created', {
      openSync: (original) => function (/** @type {fs.PathLike} */ file, /** @type {unknown} */ flags, /** @type {unknown[]} */ ...rest) {
        if (flags === 'wx') throw fault('EACCES', 'open');
        return original.call(this, file, flags, ...rest);
      },
    }, /any previous record is unchanged$/],
    ['the rename and its cleanup both fail', {
      renameSync: () => () => { throw fault('EIO', 'rename'); },
      rmSync: () => () => { throw fault('EBUSY', 'unlink'); },
    }, /temporary file remains beside it$/],
  ];
  for (const [label, replacements, message] of faults) {
    const dirs = owner();
    writePairing(dirs.record, dirs.workspace, FIRST);
    // Another attempt's leftover is not this attempt's to remove.
    const stray = path.join(dirs.folder, `.${path.basename(dirs.record)}.0123456789ab.tmp`);
    fs.writeFileSync(stray, "another attempt's leftover\n");
    assert.throws(() => withFaults(replacements, () => writePairing(dirs.record, dirs.workspace, SECOND)), (error) => {
      assert.ok(error instanceof PairingError, label);
      assert.equal(error.code, 'pairing_unwritable', label);
      assert.match(error.message, message, label);
      return true;
    }, label);
    assert.equal(readPairing(dirs.record, dirs.workspace), FIRST, `${label}: the previous record is kept`);
    assert.equal(fs.readFileSync(dirs.record, 'utf8'), recordText(FIRST), `${label}: byte for byte`);
    assert.equal(fs.readFileSync(stray, 'utf8'), "another attempt's leftover\n", `${label}: the unrelated temporary file is untouched`);
    const left = fs.readdirSync(dirs.folder).filter((name) => name !== path.basename(dirs.record) && name !== path.basename(stray));
    if (label === 'the rename and its cleanup both fail') {
      assert.equal(left.length, 1, `${label}: the refusal reports the one temporary file it could not remove`);
      assert.equal(fs.readFileSync(path.join(dirs.folder, left[0]), 'utf8'), recordText(SECOND), `${label}: it holds only the new record`);
    } else {
      assert.deepEqual(left, [], `${label}: this attempt's temporary file is gone`);
    }
  }

  const first = owner();
  refuses(() => withFaults({ mkdirSync: () => () => { throw fault('EACCES', 'mkdir'); } },
    () => writePairing(first.record, first.workspace, FIRST)), 'pairing_unwritable', 'a first save whose folder cannot be created');
  assert.equal(present(first.folder), false);
});

test('distinct profile IDs keep distinct records, and deleting one revokes only that profile', () => {
  const dirs = owner();
  const ids = ['b-serve', 'B-serve', 'b-serve.', 'a-ask'];
  const digests = ids.map((id) => sha256(`approval for ${id}`));
  ids.forEach((id, index) => writePairing(pairingPath(dirs.config, id), dirs.workspace, digests[index]));
  ids.forEach((id, index) => assert.equal(readPairing(pairingPath(dirs.config, id), dirs.workspace), digests[index], id));
  assert.equal(fs.readdirSync(dirs.folder).length, ids.length, 'one file per exact ID');
  fs.rmSync(pairingPath(dirs.config, 'B-serve'));
  assert.equal(readPairing(pairingPath(dirs.config, 'B-serve'), dirs.workspace), null, 'the deleted record reads as absent');
  for (const id of ['b-serve', 'b-serve.', 'a-ask']) {
    assert.equal(readPairing(pairingPath(dirs.config, id), dirs.workspace), digests[ids.indexOf(id)], `${id} is unaffected`);
  }
});
