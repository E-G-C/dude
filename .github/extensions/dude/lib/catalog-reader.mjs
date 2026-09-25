// @ts-check
/**
 * Private Canvas catalog reader. `packs.mjs` runs it as a short-lived helper
 * process for one pack read and owns that process's launch, deadline, stop and
 * temporary root. The helper reads the catalog once, reports over IPC and exits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availablePacks, cmdList, resolveCatalogDir } from '../../../skills/dude-compose/compose.mjs';
import { resolveMutationPath, WORKSPACE_PATHS } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

const SELF = fileURLToPath(import.meta.url);

/** @param {string} root */
function readCatalog(root) {
  try {
    resolveMutationPath(root, WORKSPACE_PATHS.PROFILE);
    resolveMutationPath(root, WORKSPACE_PATHS.BUNDLE_MANIFEST);
    const library = resolveMutationPath(root, 'library/packs');
    const catalog = resolveCatalogDir({ root, library, fetch: true });
    if ('error' in catalog) return { ok: false, error: catalog.error };
    // This resolver always returns <source-or-checkout>/library/packs. Validate
    // from that source root, not below a potentially linked library ancestor,
    // before enumerating even an empty catalog.
    const sourceRoot = fs.realpathSync(path.resolve(catalog.dir, '..', '..'));
    const catalogDir = resolveMutationPath(sourceRoot, 'library/packs');
    // Use the resolved catalog only for path validation and this one cmdList.
    // Passing it back as a local input avoids a second upstream acquisition;
    // its actual origin remains the resolver's origin, not that local shortcut.
    for (const name of availablePacks(catalogDir)) {
      resolveMutationPath(catalogDir, `${name}/pack.md`);
    }
    const result = cmdList({ root, library: catalogDir, fetch: false });
    if (result.ok) result.result.origin = catalog.origin;
    return result;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The catalog could not be read.' };
  }
}

// One operation, never a command dispatcher. The launch always ends with this
// module's path and the workspace root, whether Node runs the module directly
// or a host entry imports it, so any other importer never starts a read.
const [entry, root] = process.argv.slice(-2);
if (typeof process.send === 'function' && entry && path.resolve(entry) === SELF && root) {
  // Exit explicitly: a host runtime may hold handles that would otherwise keep
  // a finished helper alive until the deadline kills it.
  process.send(readCatalog(root), error => process.exit(error ? 1 : 0));
}
