// @ts-check
/**
 * Contract checks for the two fixed production SDK loaders in
 * lib/a2a-sdk-loader.mjs.
 *
 * Each case runs an exact byte copy of the loader module inside its own
 * test-owned folder, beside a package-shaped stand-in for the public
 * `@github/copilot-sdk` and `@github/copilot-sdk/extension` entries, so the
 * loader resolves through its own import context exactly as it does when
 * deployed. A few cases add a narrowly scoped resolve hook to return a URL
 * the package layout cannot produce. Nothing imports the real Copilot SDK,
 * starts a runtime, or touches the repository's own folders. These checks
 * show what the loader resolves, inspects, imports, and refuses; they do not
 * show that a host's automatic resolver points at an authentic SDK.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { register } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LOADER_SOURCE = fileURLToPath(new URL('./lib/a2a-sdk-loader.mjs', import.meta.url));
const ENTRY_BYTES = 16 * 1024 * 1024;
/** @param {string | Buffer} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true });
});

/**
 * One isolated loader copy and its package-shaped SDK stand-in.
 * @param {{index?: string | Buffer, extension?: string | Buffer, package?: boolean}} [entries]
 */
function loaderTree(entries = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dude-sdk-loader-')));
  scratch.push(root);
  fs.mkdirSync(path.join(root, 'lib'));
  fs.copyFileSync(LOADER_SOURCE, path.join(root, 'lib', 'a2a-sdk-loader.mjs'));
  const sdk = path.join(root, 'node_modules', '@github', 'copilot-sdk');
  if (entries.package !== false) {
    fs.mkdirSync(sdk, { recursive: true });
    fs.writeFileSync(path.join(sdk, 'package.json'), JSON.stringify({
      name: '@github/copilot-sdk', type: 'module', exports: { '.': './index.mjs', './extension': './extension.mjs' },
    }));
    fs.writeFileSync(path.join(sdk, 'index.mjs'), entries.index ?? "export const entry = 'worker';\n");
    fs.writeFileSync(path.join(sdk, 'extension.mjs'), entries.extension ?? "export const entry = 'extension';\n");
  }
  return {
    root,
    sdk,
    index: path.join(sdk, 'index.mjs'),
    extension: path.join(sdk, 'extension.mjs'),
    /** @returns {Promise<{loadWorkerSdk: () => Promise<any>, loadExtensionSdk: () => Promise<any>}>} */
    load: () => import(pathToFileURL(path.join(root, 'lib', 'a2a-sdk-loader.mjs')).href),
  };
}

/** @param {Promise<unknown>} promise @param {string} code */
async function refuses(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(/** @type {any} */ (error).code, code);
    return true;
  });
}

/**
 * Resolve `specifier` to `target` for importers inside `tree` only, so other tests and modules resolve normally.
 * @param {string} tree @param {string} specifier @param {string} target
 */
function resolveFor(tree, specifier, target) {
  const parent = pathToFileURL(`${tree}${path.sep}`).href;
  const source = `export async function resolve(specifier, context, nextResolve) {
  if (specifier === ${JSON.stringify(specifier)} && context.parentURL?.startsWith(${JSON.stringify(parent)})) {
    return { url: ${JSON.stringify(target)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
  register(`data:text/javascript,${encodeURIComponent(source)}`);
}

test('the loader exports only its two fixed production entry points, and neither takes an argument', async () => {
  const tree = loaderTree();
  const loader = await tree.load();
  assert.deepEqual(Object.keys(loader).sort(), ['loadExtensionSdk', 'loadWorkerSdk']);
  assert.deepEqual([loader.loadWorkerSdk.length, loader.loadExtensionSdk.length], [0, 0], 'no SDK path, resolver, or fallback argument');
});

test('each fixed loader resolves its own public specifier in its import context and imports exactly that resolved file, with bounded provenance', async () => {
  const tree = loaderTree();
  const loader = await tree.load();
  for (const [load, file, entry] of /** @type {Array<[() => Promise<any>, string, string]>} */ ([
    [loader.loadWorkerSdk, tree.index, 'worker'],
    [loader.loadExtensionSdk, tree.extension, 'extension'],
  ])) {
    const { api, provenance } = await load();
    const bytes = fs.readFileSync(file);
    assert.deepEqual({ ...provenance }, { resolvedUrl: pathToFileURL(file).href, path: file, bytes: bytes.length, sha256: sha256(bytes) }, entry);
    assert.ok(Object.isFrozen(provenance), `${entry}: the provenance cannot be changed`);
    assert.equal(api.entry, entry, `${entry}: the module came from the resolved file`);
    assert.equal(api, await import(provenance.resolvedUrl), `${entry}: the module is the one at exactly that URL`);
  }
});

test('a later load reports the identity first loaded, and an artifact changed since then refuses', async () => {
  const tree = loaderTree();
  const loader = await tree.load();
  const first = await loader.loadWorkerSdk();
  const second = await loader.loadWorkerSdk();
  assert.equal(second.provenance, first.provenance, 'the same provenance object, so the same identity');
  assert.equal(second.api, first.api);
  fs.appendFileSync(tree.index, '// changed after the first load\n');
  await refuses(loader.loadWorkerSdk(), 'sdk_artifact_changed');
  // The extension entry, still unchanged, keeps loading.
  assert.equal((await loader.loadExtensionSdk()).api.entry, 'extension');
});

test('an artifact that changes while it loads refuses', async () => {
  const tree = loaderTree({
    index: [
      "import fs from 'node:fs';",
      "import { fileURLToPath } from 'node:url';",
      "fs.appendFileSync(fileURLToPath(import.meta.url), '// rewritten during evaluation\\n');",
      "export const entry = 'worker';",
      '',
    ].join('\n'),
  });
  await refuses((await tree.load()).loadWorkerSdk(), 'sdk_artifact_changed');
});

test('an unresolvable SDK refuses as provenance unavailable, and a failing import as unavailable', async () => {
  await refuses((await loaderTree({ package: false }).load()).loadWorkerSdk(), 'sdk_provenance_unavailable');
  await refuses((await loaderTree({ package: false }).load()).loadExtensionSdk(), 'sdk_provenance_unavailable');
  await refuses((await loaderTree({ index: 'export const = ;\n' }).load()).loadWorkerSdk(), 'sdk_unavailable');
});

test('an entry of exactly 16 MiB loads, and one byte more refuses before it is imported', async () => {
  /** @param {number} size @param {string} marker */
  const sized = (size, marker) => {
    const head = Buffer.from(`globalThis[${JSON.stringify(marker)}] = true;\nexport const entry = 'worker';\n//`);
    return Buffer.concat([head, Buffer.alloc(size - head.length, 'x')]);
  };
  const atLimit = loaderTree({ index: sized(ENTRY_BYTES, '__dudeLoaderAtLimit') });
  const loaded = await (await atLimit.load()).loadWorkerSdk();
  assert.deepEqual([loaded.provenance.bytes, loaded.api.entry, Reflect.get(globalThis, '__dudeLoaderAtLimit')], [ENTRY_BYTES, 'worker', true]);
  const over = loaderTree({ index: sized(ENTRY_BYTES + 1, '__dudeLoaderOverLimit') });
  await refuses((await over.load()).loadWorkerSdk(), 'sdk_provenance_unavailable');
  assert.equal(Reflect.get(globalThis, '__dudeLoaderOverLimit'), undefined, 'the oversized entry was never imported');
});

test('a resolution that is not a plain file, or reaches the entry through a linked folder, refuses before import', async (context) => {
  await context.test('a data: URL', async () => {
    const tree = loaderTree();
    resolveFor(tree.root, '@github/copilot-sdk', 'data:text/javascript,globalThis.__dudeLoaderData%3Dtrue%3Bexport%20const%20entry%3D1');
    await refuses((await tree.load()).loadWorkerSdk(), 'sdk_provenance_unavailable');
    assert.equal(Reflect.get(globalThis, '__dudeLoaderData'), undefined);
  });

  await context.test('a file: URL with a query', async () => {
    const tree = loaderTree();
    resolveFor(tree.root, '@github/copilot-sdk/extension', `${pathToFileURL(tree.extension).href}?fresh=1`);
    await refuses((await tree.load()).loadExtensionSdk(), 'sdk_provenance_unavailable');
  });

  await context.test('a folder link', async (t) => {
    const tree = loaderTree();
    const linked = path.join(tree.root, 'linked-sdk');
    try {
      fs.symlinkSync(tree.sdk, linked, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      t.skip(`this host cannot create a folder link here (${/** @type {any} */ (error).code})`);
      return;
    }
    resolveFor(tree.root, '@github/copilot-sdk', pathToFileURL(path.join(linked, 'index.mjs')).href);
    await refuses((await tree.load()).loadWorkerSdk(), 'sdk_provenance_unavailable');
  });
});
