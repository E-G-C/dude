// @ts-check
/** Read-only canonical feature ownership inventory and resolution. */

import fs from 'node:fs';
import path from 'node:path';

import {
  parseFrontmatterScalars,
  parseSpecIdentity,
  resolveSpecIdentity,
} from './feature-identity.mjs';
import { WORKSPACE_PATHS } from './workspace-paths.mjs';

/**
 * @typedef {{ ideaPath: string, specPath: string }} FeatureRecord
 * @typedef {{ code: string, severity: 'error' | 'warning', path: string, message: string }} FeatureDiagnostic
 * @typedef {{ features: FeatureRecord[], diagnostics: FeatureDiagnostic[] }} FeatureInventory
 */

/** @param {string} left @param {string} right @returns {number} */
function compareCodeUnit(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** @param {FeatureDiagnostic[]} diagnostics @returns {FeatureDiagnostic[]} */
function sortDiagnostics(diagnostics) {
  return diagnostics.sort((left, right) => (
    compareCodeUnit(left.path, right.path)
    || compareCodeUnit(left.code, right.code)
    || compareCodeUnit(left.message, right.message)
  ));
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {unknown} error @returns {boolean} */
function isMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

/**
 * @param {FeatureDiagnostic[]} diagnostics
 * @param {string} code
 * @param {'error' | 'warning'} severity
 * @param {string} diagnosticPath
 * @param {string} message
 */
function diagnose(diagnostics, code, severity, diagnosticPath, message) {
  diagnostics.push({ code, severity, path: diagnosticPath, message });
}

/**
 * Inventory canonical feature owners from direct `.dude/ideas/*.md` ledgers.
 * @param {{ root: string }} options
 * @returns {FeatureInventory}
 */
export function inventoryDefinedFeatures({ root }) {
  /** @type {FeatureRecord[]} */
  const features = [];
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [];

  let absoluteRoot;
  try {
    if (typeof root !== 'string' || !root) throw new Error('workspace root is required');
    absoluteRoot = path.resolve(root);
    const rootStat = fs.lstatSync(absoluteRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error('workspace root must be a real directory and not a symbolic link');
    }
    fs.realpathSync(absoluteRoot);
  } catch (error) {
    diagnose(
      diagnostics,
      'FEATURE_ROOT_UNSAFE',
      'error',
      '.',
      `workspace root is unsafe (${errorMessage(error)})`,
    );
    return { features, diagnostics: sortDiagnostics(diagnostics) };
  }

  const ideasParts = WORKSPACE_PATHS.IDEAS_DIR.split('/');
  let ideasRoot = absoluteRoot;
  for (let index = 0; index < ideasParts.length; index += 1) {
    ideasRoot = path.join(ideasRoot, ideasParts[index]);
    let stat;
    try {
      stat = fs.lstatSync(ideasRoot);
    } catch (error) {
      if (isMissing(error)) {
        diagnose(
          diagnostics,
          'FEATURE_IDEAS_ROOT_MISSING',
          'warning',
          WORKSPACE_PATHS.IDEAS_DIR,
          'canonical ideas root is missing',
        );
      } else {
        diagnose(
          diagnostics,
          'FEATURE_IDEAS_ROOT_UNREADABLE',
          'error',
          WORKSPACE_PATHS.IDEAS_DIR,
          `canonical ideas root is unreadable (${errorMessage(error)})`,
        );
      }
      return { features, diagnostics: sortDiagnostics(diagnostics) };
    }
    if (stat.isSymbolicLink()) {
      diagnose(
        diagnostics,
        'FEATURE_IDEAS_ROOT_UNSAFE',
        'error',
        WORKSPACE_PATHS.IDEAS_DIR,
        `unsafe canonical ideas root or ancestor '${ideasParts.slice(0, index + 1).join('/')}' is a symbolic link`,
      );
      return { features, diagnostics: sortDiagnostics(diagnostics) };
    }
    if (!stat.isDirectory()) {
      diagnose(
        diagnostics,
        'FEATURE_IDEAS_ROOT_NOT_DIRECTORY',
        'error',
        WORKSPACE_PATHS.IDEAS_DIR,
        `canonical ideas root or ancestor '${ideasParts.slice(0, index + 1).join('/')}' is not a directory`,
      );
      return { features, diagnostics: sortDiagnostics(diagnostics) };
    }
  }

  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(ideasRoot, { withFileTypes: true });
  } catch (error) {
    diagnose(
      diagnostics,
      'FEATURE_IDEAS_ROOT_UNREADABLE',
      'error',
      WORKSPACE_PATHS.IDEAS_DIR,
      `canonical ideas root is unreadable (${errorMessage(error)})`,
    );
    return { features, diagnostics: sortDiagnostics(diagnostics) };
  }
  entries.sort((left, right) => compareCodeUnit(left.name, right.name));

  for (const entry of entries) {
    const ideaPath = `${WORKSPACE_PATHS.IDEAS_DIR}/${entry.name}`;
    const absoluteIdeaPath = path.join(ideasRoot, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(absoluteIdeaPath);
    } catch (error) {
      if (isMissing(error)) {
        diagnose(
          diagnostics,
          'FEATURE_IDEA_ENTRY_UNSUPPORTED',
          'error',
          ideaPath,
          'idea entry changed during inventory; rerun the operation',
        );
      } else {
        diagnose(
          diagnostics,
          'FEATURE_IDEA_UNREADABLE',
          'error',
          ideaPath,
          `idea ledger is unreadable (${errorMessage(error)})`,
        );
      }
      continue;
    }

    if (stat.isSymbolicLink() || !stat.isFile() || !entry.name.endsWith('.md')) {
      let detail = 'unsupported non-regular entry in canonical ideas; only direct regular .md files are allowed';
      if (stat.isSymbolicLink()) {
        detail = 'unsupported symbolic link in canonical ideas; only direct regular .md files are allowed';
      } else if (stat.isDirectory()) {
        detail = 'unsupported nested directory in canonical ideas; only direct regular .md files are allowed';
      } else if (stat.isFile() && !entry.name.endsWith('.md')) {
        detail = 'unsupported non-Markdown file in canonical ideas; only direct regular .md files are allowed';
      }
      diagnose(
        diagnostics,
        'FEATURE_IDEA_ENTRY_UNSUPPORTED',
        'error',
        ideaPath,
        detail,
      );
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(absoluteIdeaPath, 'utf8');
    } catch (error) {
      diagnose(
        diagnostics,
        'FEATURE_IDEA_UNREADABLE',
        'error',
        ideaPath,
        `idea ledger is unreadable (${errorMessage(error)})`,
      );
      continue;
    }

    let frontmatter;
    try {
      frontmatter = parseFrontmatterScalars(content, {
        canonicalKeys: ['title', 'slug', 'status', 'spec_path'],
      });
    } catch (error) {
      diagnose(
        diagnostics,
        'FEATURE_FRONTMATTER_MALFORMED',
        'error',
        ideaPath,
        `malformed frontmatter (${errorMessage(error)})`,
      );
      continue;
    }

    const status = frontmatter.scalars.get('status')?.value || '';
    const specPath = frontmatter.scalars.get('spec_path')?.value || '';
    let statusValid = true;
    if (!status) {
      statusValid = false;
      diagnose(
        diagnostics,
        'FEATURE_STATUS_MISSING',
        'error',
        ideaPath,
        "frontmatter is missing 'status:'",
      );
    } else if (status !== 'draft' && status !== 'defined') {
      statusValid = false;
      diagnose(
        diagnostics,
        'FEATURE_STATUS_INVALID',
        'error',
        ideaPath,
        `invalid status '${status}' (valid: draft, defined)`,
      );
    }

    let specPathValid = false;
    if (!specPath) {
      if (status === 'defined') {
        diagnose(
          diagnostics,
          'FEATURE_SPEC_PATH_MISSING',
          'error',
          ideaPath,
          'status: defined but spec_path is missing',
        );
      }
    } else if (!parseSpecIdentity(specPath)) {
      diagnose(
        diagnostics,
        'FEATURE_SPEC_PATH_INVALID',
        'error',
        ideaPath,
        `spec_path '${specPath}' must point at .dude/specs/<feature>/spec.md`,
      );
    } else {
      try {
        resolveSpecIdentity(absoluteRoot, specPath, { canonicalOnly: true, mustExist: true });
        specPathValid = true;
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes('target does not exist')) {
          diagnose(
            diagnostics,
            'FEATURE_SPEC_PATH_DANGLING',
            'error',
            ideaPath,
            `spec_path '${specPath}' is unsafe or unresolved (${message})`,
          );
        } else {
          diagnose(
            diagnostics,
            'FEATURE_SPEC_PATH_UNSAFE',
            'error',
            ideaPath,
            `spec_path '${specPath}' is unsafe or unresolved (${message})`,
          );
        }
      }
    }

    if (status === 'draft' && specPathValid) {
      diagnose(
        diagnostics,
        'FEATURE_DRAFT_SPEC_PATH',
        'error',
        ideaPath,
        'status: draft but spec_path resolves to a spec; drafts must not own a spec',
      );
    }

    if (statusValid && status === 'defined' && specPathValid) {
      features.push({ ideaPath, specPath });
    }
  }

  features.sort((left, right) => (
    compareCodeUnit(left.specPath, right.specPath)
    || compareCodeUnit(left.ideaPath, right.ideaPath)
  ));

  /** @type {Map<string, string[]>} */
  const ownersBySpec = new Map();
  for (const feature of features) {
    if (!ownersBySpec.has(feature.specPath)) ownersBySpec.set(feature.specPath, []);
    ownersBySpec.get(feature.specPath)?.push(feature.ideaPath);
  }
  for (const [specPath, ideaPaths] of ownersBySpec) {
    if (ideaPaths.length < 2) continue;
    ideaPaths.sort(compareCodeUnit);
    diagnose(
      diagnostics,
      'FEATURE_OWNER_DUPLICATE',
      'error',
      specPath,
      `duplicate defined idea owners: ${ideaPaths.join(', ')}`,
    );
  }

  return { features, diagnostics: sortDiagnostics(diagnostics) };
}

/**
 * Resolve one canonical spec path to its globally unambiguous owner.
 * @param {{ root: string, specPath: string }} options
 * @returns {{ owner: FeatureRecord | null, diagnostics: FeatureDiagnostic[] }}
 */
export function resolveFeatureOwner({ root, specPath }) {
  const inventory = inventoryDefinedFeatures({ root });
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [...inventory.diagnostics];

  if (!parseSpecIdentity(specPath)) {
    diagnose(
      diagnostics,
      'FEATURE_QUERY_INVALID',
      'error',
      typeof specPath === 'string' ? specPath : String(specPath),
      'feature query must be exactly .dude/specs/<feature>/spec.md',
    );
    return { owner: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { owner: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  const matches = inventory.features.filter((feature) => feature.specPath === specPath);
  if (matches.length !== 1) {
    diagnose(
      diagnostics,
      'FEATURE_OWNER_NOT_FOUND',
      'error',
      specPath,
      `no defined feature owner found for '${specPath}'`,
    );
    return { owner: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  return { owner: matches[0], diagnostics: sortDiagnostics(diagnostics) };
}
