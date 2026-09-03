// @ts-check
/** Read-only canonical idea/package inventory and exact ownership resolution. */

import fs from 'node:fs';
import path from 'node:path';

import {
  parseFrontmatterScalars,
  parseIdeaIdentity,
  parseSpecIdentity,
  resolveSpecIdentity,
} from './feature-identity.mjs';
import { WORKSPACE_PATHS } from './workspace-paths.mjs';

/**
 * Canonical scalar keys permitted in an idea ledger's frontmatter.
 * @type {readonly string[]}
 */
export const CANONICAL_IDEA_KEYS = Object.freeze(['title', 'slug', 'status', 'spec_path', 'depends-on']);

/**
 * @typedef {{
 *   ideaPath: string,
 *   number: string,
 *   numberValue: number,
 *   slug: string,
 *   status: 'draft' | 'defined' | 'resolved',
 *   specPath: string,
 * }} IdeaRecord
 * @typedef {{
 *   feature: string,
 *   directoryPath: string,
 *   specPath: string,
 *   number: string,
 *   numberValue: number,
 *   slug: string,
 * }} PackageRecord
 * @typedef {{ ideaPath: string, specPath: string }} FeatureRecord
 * @typedef {{ code: string, severity: 'error' | 'warning', path: string, message: string }} FeatureDiagnostic
 * @typedef {{
 *   ideas: IdeaRecord[],
 *   packages: PackageRecord[],
 *   features: FeatureRecord[],
 *   nextNumber: string | null,
 *   nextNumberValue: number | null,
 *   exhausted: boolean,
 *   diagnostics: FeatureDiagnostic[],
 * }} LifecycleInventory
 * @typedef {{ features: FeatureRecord[], diagnostics: FeatureDiagnostic[] }} FeatureInventory
 * @typedef {{
 *   inventory: LifecycleInventory,
 *   idea: IdeaRecord | null,
 *   owner: FeatureRecord | null,
 *   choices: IdeaRecord[],
 *   explicit: boolean,
 *   diagnostics: FeatureDiagnostic[],
 * }} LifecycleSummarySelection
 */

/** @param {string} left @param {string} right */
function compareCodeUnit(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** @param {FeatureDiagnostic[]} diagnostics */
function sortDiagnostics(diagnostics) {
  return diagnostics.sort((left, right) => (
    Number(left.code === 'FEATURE_SPEC_PATH_UNSAFE') - Number(right.code === 'FEATURE_SPEC_PATH_UNSAFE')
    || compareCodeUnit(left.path, right.path)
    || compareCodeUnit(left.code, right.code)
    || compareCodeUnit(left.message, right.message)
  ));
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {unknown} error */
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
 * Resolve one canonical direct-inventory root without following symlinks.
 * @param {string} absoluteRoot
 * @param {string} relativeRoot
 * @param {FeatureDiagnostic[]} diagnostics
 * @param {{ missingWarning?: { code: string, message: string } }} [options]
 * @returns {string | null}
 */
function resolveInventoryRoot(absoluteRoot, relativeRoot, diagnostics, options = {}) {
  const parts = relativeRoot.split('/');
  let cursor = absoluteRoot;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (isMissing(error)) {
        if (options.missingWarning) {
          diagnose(
            diagnostics,
            options.missingWarning.code,
            'warning',
            relativeRoot,
            options.missingWarning.message,
          );
        }
      } else {
        diagnose(
          diagnostics,
          relativeRoot === WORKSPACE_PATHS.IDEAS_DIR
            ? 'FEATURE_IDEAS_ROOT_UNREADABLE'
            : 'FEATURE_SPECS_ROOT_UNREADABLE',
          'error',
          relativeRoot,
          `canonical inventory root is unreadable (${errorMessage(error)})`,
        );
      }
      return null;
    }
    if (stat.isSymbolicLink()) {
      diagnose(
        diagnostics,
        relativeRoot === WORKSPACE_PATHS.IDEAS_DIR
          ? 'FEATURE_IDEAS_ROOT_UNSAFE'
          : 'FEATURE_SPECS_ROOT_UNSAFE',
        'error',
        relativeRoot,
        `unsafe canonical inventory root or ancestor '${parts.slice(0, index + 1).join('/')}' is a symbolic link`,
      );
      return null;
    }
    if (!stat.isDirectory()) {
      diagnose(
        diagnostics,
        relativeRoot === WORKSPACE_PATHS.IDEAS_DIR
          ? 'FEATURE_IDEAS_ROOT_NOT_DIRECTORY'
          : 'FEATURE_SPECS_ROOT_NOT_DIRECTORY',
        'error',
        relativeRoot,
        `canonical inventory root or ancestor '${parts.slice(0, index + 1).join('/')}' is not a directory`,
      );
      return null;
    }
  }
  return cursor;
}

/**
 * @param {string} absoluteRoot
 * @param {FeatureDiagnostic[]} diagnostics
 * @param {{ validateSpecFiles: boolean }} options
 * @returns {IdeaRecord[]}
 */
function inventoryIdeas(absoluteRoot, diagnostics, options) {
  /** @type {IdeaRecord[]} */
  const ideas = [];
  const ideasRoot = resolveInventoryRoot(
    absoluteRoot,
    WORKSPACE_PATHS.IDEAS_DIR,
    diagnostics,
    {
      missingWarning: {
        code: 'FEATURE_IDEAS_ROOT_MISSING',
        message: 'canonical ideas root is missing',
      },
    },
  );
  if (ideasRoot === null) return ideas;

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
    return ideas;
  }
  entries.sort((left, right) => compareCodeUnit(left.name, right.name));

  for (const entry of entries) {
    const ideaPath = `${WORKSPACE_PATHS.IDEAS_DIR}/${entry.name}`;
    const absoluteIdeaPath = path.join(ideasRoot, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(absoluteIdeaPath);
    } catch (error) {
      diagnose(
        diagnostics,
        isMissing(error) ? 'FEATURE_IDEA_ENTRY_UNSUPPORTED' : 'FEATURE_IDEA_UNREADABLE',
        'error',
        ideaPath,
        isMissing(error)
          ? 'idea entry changed during inventory; rerun the operation'
          : `idea ledger is unreadable (${errorMessage(error)})`,
      );
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
      diagnose(diagnostics, 'FEATURE_IDEA_ENTRY_UNSUPPORTED', 'error', ideaPath, detail);
      continue;
    }

    const identity = parseIdeaIdentity(ideaPath);
    if (identity === null) {
      diagnose(
        diagnostics,
        'FEATURE_IDEA_IDENTITY_INVALID',
        'error',
        ideaPath,
        'idea path must be exactly .dude/ideas/<NNN>-<slug>.md with ASCII 001-999',
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
      frontmatter = parseFrontmatterScalars(content, { canonicalKeys: CANONICAL_IDEA_KEYS });
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

    const slugScalar = frontmatter.scalars.get('slug');
    const slug = slugScalar?.value ?? '';
    if (!slugScalar) {
      diagnose(diagnostics, 'FEATURE_SLUG_MISSING', 'error', ideaPath, "frontmatter is missing 'slug:'");
    } else if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      diagnose(diagnostics, 'FEATURE_SLUG_INVALID', 'error', ideaPath, `invalid slug '${slug}'`);
    } else if (slug !== identity.slug) {
      diagnose(
        diagnostics,
        'FEATURE_IDEA_SLUG_MISMATCH',
        'error',
        ideaPath,
        `filename slug '${identity.slug}' does not match frontmatter slug '${slug}'`,
      );
    }

    const statusScalar = frontmatter.scalars.get('status');
    const status = statusScalar?.value ?? '';
    const exactResolved = status === 'resolved' && statusScalar?.raw === 'resolved';
    let statusValid = true;
    if (!statusScalar) {
      statusValid = false;
      diagnose(diagnostics, 'FEATURE_STATUS_MISSING', 'error', ideaPath, "frontmatter is missing 'status:'");
    } else if (status !== 'draft' && status !== 'defined' && !exactResolved) {
      statusValid = false;
      diagnose(
        diagnostics,
        'FEATURE_STATUS_INVALID',
        'error',
        ideaPath,
        `invalid status '${status}' (valid: draft, defined, resolved)`,
      );
    }

    const rawSpecPath = frontmatter.scalars.get('spec_path')?.value;
    const specPath = rawSpecPath ?? '';
    let specPathValid = false;
    if (status === 'resolved') {
      if (rawSpecPath !== '') {
        diagnose(
          diagnostics,
          'FEATURE_RESOLVED_SPEC_PATH',
          'error',
          ideaPath,
          'status: resolved requires an empty spec_path:',
        );
      }
    } else if (!specPath) {
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
        `spec_path '${specPath}' must point at .dude/specs/<NNN>-<slug>/spec.md`,
      );
    } else if (!options.validateSpecFiles) {
      specPathValid = true;
    } else {
      try {
        resolveSpecIdentity(absoluteRoot, specPath, { canonicalOnly: true, mustExist: true });
        specPathValid = true;
      } catch (error) {
        const message = errorMessage(error);
        diagnose(
          diagnostics,
          message.includes('target does not exist')
            ? 'FEATURE_SPEC_PATH_DANGLING'
            : 'FEATURE_SPEC_PATH_UNSAFE',
          'error',
          ideaPath,
          `spec_path '${specPath}' is unsafe or unresolved (${message})`,
        );
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

    if (slugScalar && /^[a-z0-9][a-z0-9-]*$/.test(slug) && statusValid) {
      ideas.push({
        ideaPath,
        number: identity.number,
        numberValue: identity.numberValue,
        slug,
        status: /** @type {'draft' | 'defined' | 'resolved'} */ (status),
        specPath,
      });
    }
  }
  return ideas;
}

/**
 * @param {string} absoluteRoot
 * @param {FeatureDiagnostic[]} diagnostics
 * @param {{ validateSpecFiles: boolean }} options
 * @returns {PackageRecord[]}
 */
function inventoryPackages(absoluteRoot, diagnostics, options) {
  /** @type {PackageRecord[]} */
  const packages = [];
  const specsRoot = resolveInventoryRoot(absoluteRoot, WORKSPACE_PATHS.SPECS_DIR, diagnostics);
  if (specsRoot === null) return packages;

  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(specsRoot, { withFileTypes: true });
  } catch (error) {
    diagnose(
      diagnostics,
      'FEATURE_SPECS_ROOT_UNREADABLE',
      'error',
      WORKSPACE_PATHS.SPECS_DIR,
      `canonical specs root is unreadable (${errorMessage(error)})`,
    );
    return packages;
  }
  entries.sort((left, right) => compareCodeUnit(left.name, right.name));

  for (const entry of entries) {
    const directoryPath = `${WORKSPACE_PATHS.SPECS_DIR}/${entry.name}`;
    const specPath = `${directoryPath}/spec.md`;
    const absoluteDirectory = path.join(specsRoot, entry.name);
    let stat;
    try {
      stat = fs.lstatSync(absoluteDirectory);
    } catch (error) {
      diagnose(
        diagnostics,
        'FEATURE_PACKAGE_ENTRY_UNSUPPORTED',
        'error',
        directoryPath,
        isMissing(error)
          ? 'feature package entry changed during inventory; rerun the operation'
          : `feature package entry is unreadable (${errorMessage(error)})`,
      );
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      diagnose(
        diagnostics,
        'FEATURE_PACKAGE_ENTRY_UNSUPPORTED',
        'error',
        directoryPath,
        'unsupported feature package entry; only direct real directories are allowed',
      );
      continue;
    }

    const identity = parseSpecIdentity(specPath);
    if (identity === null) {
      diagnose(
        diagnostics,
        'FEATURE_PACKAGE_IDENTITY_INVALID',
        'error',
        directoryPath,
        'feature package must be exactly .dude/specs/<NNN>-<slug> with ASCII 001-999',
      );
      continue;
    }

    if (options.validateSpecFiles) {
      try {
        const absoluteSpec = path.join(absoluteDirectory, 'spec.md');
        const specStat = fs.lstatSync(absoluteSpec);
        if (specStat.isSymbolicLink() || !specStat.isFile()) {
          throw new Error('spec.md is not a direct regular file');
        }
        fs.readFileSync(absoluteSpec);
      } catch (error) {
        const alreadyDiagnosed = diagnostics.some((diagnostic) => (
          diagnostic.code === 'FEATURE_SPEC_PATH_UNSAFE'
          && diagnostic.message.includes(`'${specPath}'`)
        ));
        if (!alreadyDiagnosed) {
          diagnose(
            diagnostics,
            isMissing(error) ? 'FEATURE_PACKAGE_SPEC_MISSING' : 'FEATURE_PACKAGE_SPEC_UNSAFE',
            'error',
            specPath,
            isMissing(error)
              ? 'feature package is missing its direct spec.md'
              : `feature package spec is unsafe or unreadable (${errorMessage(error)})`,
          );
        }
        continue;
      }
    }

    packages.push({
      feature: identity.feature,
      directoryPath: identity.directoryPath,
      specPath: identity.path,
      number: identity.number,
      numberValue: identity.numberValue,
      slug: identity.slug,
    });
  }
  return packages;
}

/**
 * @template T
 * @param {T[]} records
 * @param {(record: T) => string} keyFor
 * @param {(record: T) => string} pathFor
 * @param {FeatureDiagnostic[]} diagnostics
 * @param {string} code
 * @param {(key: string, paths: string[]) => string} messageFor
 */
function diagnoseDuplicates(records, keyFor, pathFor, diagnostics, code, messageFor) {
  /** @type {Map<string, string[]>} */
  const grouped = new Map();
  for (const record of records) {
    const key = keyFor(record);
    const paths = grouped.get(key) ?? [];
    paths.push(pathFor(record));
    grouped.set(key, paths);
  }
  for (const [key, paths] of grouped) {
    if (paths.length < 2) continue;
    paths.sort(compareCodeUnit);
    diagnose(diagnostics, code, 'error', paths[0], messageFor(key, paths));
  }
}

/**
 * @param {{ root: string, validateSpecFiles: boolean }} options
 * @returns {LifecycleInventory}
 */
function inventoryLifecycle({ root, validateSpecFiles }) {
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [];
  /** @type {IdeaRecord[]} */
  let ideas = [];
  /** @type {PackageRecord[]} */
  let packages = [];
  /** @type {FeatureRecord[]} */
  const features = [];

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
    return {
      ideas,
      packages,
      features,
      nextNumber: null,
      nextNumberValue: null,
      exhausted: false,
      diagnostics: sortDiagnostics(diagnostics),
    };
  }

  ideas = inventoryIdeas(absoluteRoot, diagnostics, { validateSpecFiles });
  packages = inventoryPackages(absoluteRoot, diagnostics, { validateSpecFiles });
  ideas.sort((left, right) => left.numberValue - right.numberValue || compareCodeUnit(left.ideaPath, right.ideaPath));
  packages.sort((left, right) => left.numberValue - right.numberValue || compareCodeUnit(left.specPath, right.specPath));

  diagnoseDuplicates(
    ideas,
    (idea) => idea.number,
    (idea) => idea.ideaPath,
    diagnostics,
    'FEATURE_IDEA_NUMBER_DUPLICATE',
    (number, paths) => `duplicate idea lifecycle number ${number}: ${paths.join(', ')}`,
  );
  diagnoseDuplicates(
    ideas,
    (idea) => idea.slug,
    (idea) => idea.ideaPath,
    diagnostics,
    'FEATURE_IDEA_SLUG_DUPLICATE',
    (slug, paths) => `duplicate idea slug '${slug}': ${paths.join(', ')}`,
  );
  diagnoseDuplicates(
    packages,
    (featurePackage) => featurePackage.number,
    (featurePackage) => featurePackage.directoryPath,
    diagnostics,
    'FEATURE_PACKAGE_NUMBER_DUPLICATE',
    (number, paths) => `duplicate feature package lifecycle number ${number}: ${paths.join(', ')}`,
  );

  /** @type {Map<string, IdeaRecord[]>} */
  const ideasBySpec = new Map();
  const packageSpecPaths = new Set(packages.map((featurePackage) => featurePackage.specPath));
  for (const idea of ideas) {
    if (idea.status !== 'defined'
      || parseSpecIdentity(idea.specPath) === null
      || !packageSpecPaths.has(idea.specPath)) continue;
    const owners = ideasBySpec.get(idea.specPath) ?? [];
    owners.push(idea);
    ideasBySpec.set(idea.specPath, owners);
  }
  if (!validateSpecFiles) {
    for (const idea of ideas) {
      if (idea.status !== 'defined'
        || parseSpecIdentity(idea.specPath) === null
        || packageSpecPaths.has(idea.specPath)) continue;
      diagnose(
        diagnostics,
        'FEATURE_OWNER_NOT_FOUND',
        'error',
        idea.specPath,
        `defined idea has no direct feature package for '${idea.specPath}'`,
      );
    }
  }
  for (const [specPath, owners] of ideasBySpec) {
    owners.sort((left, right) => compareCodeUnit(left.ideaPath, right.ideaPath));
    if (owners.length > 1) {
      diagnose(
        diagnostics,
        'FEATURE_OWNER_DUPLICATE',
        'error',
        specPath,
        `duplicate defined idea owners: ${owners.map((owner) => owner.ideaPath).join(', ')}`,
      );
    }
    for (const owner of owners) {
      const packageIdentity = parseSpecIdentity(specPath);
      if (packageIdentity
        && (owner.number !== packageIdentity.number || owner.slug !== packageIdentity.slug)) {
        diagnose(
          diagnostics,
          'FEATURE_OWNER_IDENTITY_MISMATCH',
          'error',
          owner.ideaPath,
          `defined owner ${owner.ideaPath} identity ${owner.number}-${owner.slug} does not match package ${specPath}`,
        );
      }
    }
  }

  for (const featurePackage of packages) {
    const owners = ideasBySpec.get(featurePackage.specPath) ?? [];
    if (owners.length === 0) {
      diagnose(
        diagnostics,
        'FEATURE_OWNER_NOT_FOUND',
        'error',
        featurePackage.specPath,
        `feature package has no defined idea owner for '${featurePackage.specPath}'`,
      );
    } else {
      for (const owner of owners) features.push({
        ideaPath: owner.ideaPath,
        specPath: featurePackage.specPath,
      });
    }
  }

  /** @type {Map<string, { ideas: IdeaRecord[], packages: PackageRecord[] }>} */
  const claims = new Map();
  for (const idea of ideas) {
    const claim = claims.get(idea.number) ?? { ideas: [], packages: [] };
    claim.ideas.push(idea);
    claims.set(idea.number, claim);
  }
  for (const featurePackage of packages) {
    const claim = claims.get(featurePackage.number) ?? { ideas: [], packages: [] };
    claim.packages.push(featurePackage);
    claims.set(featurePackage.number, claim);
  }
  for (const [number, claim] of claims) {
    if (claim.ideas.length === 0 || claim.packages.length === 0) continue;
    const validPair = claim.ideas.length === 1
      && claim.packages.length === 1
      && claim.ideas[0].status === 'defined'
      && claim.ideas[0].specPath === claim.packages[0].specPath
      && claim.ideas[0].slug === claim.packages[0].slug;
    if (validPair) continue;
    const paths = [
      ...claim.ideas.map((idea) => idea.ideaPath),
      ...claim.packages.map((featurePackage) => featurePackage.directoryPath),
    ].sort(compareCodeUnit);
    diagnose(
      diagnostics,
      'FEATURE_NUMBER_COLLISION',
      'error',
      paths[0],
      `conflicting lifecycle number ${number}: ${paths.join(', ')}`,
    );
  }

  features.sort((left, right) => (
    compareCodeUnit(left.specPath, right.specPath)
    || compareCodeUnit(left.ideaPath, right.ideaPath)
  ));
  sortDiagnostics(diagnostics);
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const max = Math.max(
    0,
    ...ideas.map((idea) => idea.numberValue),
    ...packages.map((featurePackage) => featurePackage.numberValue),
  );
  const exhausted = !hasErrors && max === 999;
  const nextNumberValue = hasErrors || exhausted ? null : max + 1;
  return {
    ideas,
    packages,
    features,
    nextNumber: nextNumberValue === null ? null : String(nextNumberValue).padStart(3, '0'),
    nextNumberValue,
    exhausted,
    diagnostics,
  };
}

/**
 * Inventory all direct numbered ideas and feature packages as one fail-closed
 * lifecycle authority. Full inventory validates and reads every package spec.
 * @param {{ root: string }} options
 * @returns {LifecycleInventory}
 */
export function inventoryLifecycleIdentities({ root }) {
  return inventoryLifecycle({ root, validateSpecFiles: true });
}

/**
 * Select one exact lifecycle idea from summary inventory. Package directories
 * are inventoried by direct identity, but package documents are deferred until
 * the caller has selected one exact owner.
 * @param {{ root: string, target?: string }} options
 * @returns {LifecycleSummarySelection}
 */
export function selectLifecycleIdeaSummary({ root, target }) {
  const inventory = inventoryLifecycle({ root, validateSpecFiles: false });
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [...inventory.diagnostics];
  const explicit = target !== undefined;
  /** @type {IdeaRecord | null} */
  let idea = null;
  /** @type {FeatureRecord | null} */
  let owner = null;
  /** @type {IdeaRecord[]} */
  let choices = [];

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { inventory, idea, owner, choices, explicit, diagnostics: sortDiagnostics(diagnostics) };
  }

  if (explicit) {
    const byPath = typeof target === 'string' && target.startsWith('.dude/');
    const valid = typeof target === 'string' && (byPath
      ? parseIdeaIdentity(target) !== null
      : /^[a-z0-9][a-z0-9-]*$/.test(target));
    if (!valid) {
      diagnose(
        diagnostics,
        'FEATURE_IDEA_QUERY_INVALID',
        'error',
        '.',
        'idea query must be an exact canonical frontmatter slug or numbered direct idea path',
      );
      return { inventory, idea, owner, choices, explicit, diagnostics: sortDiagnostics(diagnostics) };
    }
    const matches = inventory.ideas.filter((candidate) => (
      byPath ? candidate.ideaPath === target : candidate.slug === target
    ));
    if (matches.length !== 1) {
      diagnose(
        diagnostics,
        'FEATURE_IDEA_NOT_FOUND',
        'error',
        '.',
        'no exact canonical idea matched the supplied target',
      );
      return { inventory, idea, owner, choices, explicit, diagnostics: sortDiagnostics(diagnostics) };
    }
    [idea] = matches;
  } else {
    const ownedIdeas = new Set(inventory.features.map((feature) => feature.ideaPath));
    choices = inventory.ideas.filter((candidate) => (
      candidate.status === 'draft'
      || (candidate.status === 'defined' && ownedIdeas.has(candidate.ideaPath))
    ));
    if (choices.length !== 1) {
      return { inventory, idea, owner, choices, explicit, diagnostics: sortDiagnostics(diagnostics) };
    }
    [idea] = choices;
  }

  if (idea.status === 'defined') {
    const owners = inventory.features.filter((feature) => (
      feature.ideaPath === idea.ideaPath && feature.specPath === idea.specPath
    ));
    if (owners.length !== 1) {
      diagnose(
        diagnostics,
        'FEATURE_OWNER_NOT_FOUND',
        'error',
        idea.specPath,
        'no exact defined owner was established for the selected feature package',
      );
      return {
        inventory,
        idea: null,
        owner,
        choices,
        explicit,
        diagnostics: sortDiagnostics(diagnostics),
      };
    }
    [owner] = owners;
  }

  return { inventory, idea, owner, choices, explicit, diagnostics: sortDiagnostics(diagnostics) };
}

/**
 * Inventory canonical defined owners while sharing all lifecycle diagnostics.
 * @param {{ root: string }} options
 * @returns {FeatureInventory}
 */
export function inventoryDefinedFeatures({ root }) {
  const inventory = inventoryLifecycleIdentities({ root });
  return { features: inventory.features, diagnostics: inventory.diagnostics };
}

/**
 * Resolve an exact semantic slug or exact direct idea path. Exactly one selector
 * kind must be supplied; no filename, prefix, or package fallback is attempted.
 * @param {{ root: string, slug?: string, ideaPath?: string }} options
 * @returns {{ idea: IdeaRecord | null, diagnostics: FeatureDiagnostic[] }}
 */
export function resolveIdeaSelector({ root, slug, ideaPath }) {
  const inventory = inventoryLifecycleIdentities({ root });
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [...inventory.diagnostics];
  const hasSlug = typeof slug === 'string';
  const hasPath = typeof ideaPath === 'string';
  const queryPath = hasPath ? /** @type {string} */ (ideaPath) : String(slug ?? '');
  if (hasSlug === hasPath
    || (hasSlug && !/^[a-z0-9][a-z0-9-]*$/.test(/** @type {string} */ (slug)))
    || (hasPath && parseIdeaIdentity(/** @type {string} */ (ideaPath)) === null)) {
    diagnose(
      diagnostics,
      'FEATURE_IDEA_QUERY_INVALID',
      'error',
      queryPath,
      'idea query must supply exactly one canonical frontmatter slug or exact numbered direct idea path',
    );
    return { idea: null, diagnostics: sortDiagnostics(diagnostics) };
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { idea: null, diagnostics: sortDiagnostics(diagnostics) };
  }

  const matches = hasSlug
    ? inventory.ideas.filter((idea) => idea.slug === slug)
    : inventory.ideas.filter((idea) => idea.ideaPath === ideaPath);
  if (matches.length !== 1) {
    diagnose(
      diagnostics,
      'FEATURE_IDEA_NOT_FOUND',
      'error',
      queryPath,
      `no exact idea found for '${queryPath}'`,
    );
    return { idea: null, diagnostics: sortDiagnostics(diagnostics) };
  }
  return { idea: matches[0], diagnostics: sortDiagnostics(diagnostics) };
}

/**
 * Resolve one canonical spec path to its globally unambiguous exact owner.
 * @param {{ root: string, specPath: string }} options
 * @returns {{ owner: FeatureRecord | null, diagnostics: FeatureDiagnostic[] }}
 */
export function resolveFeatureOwner({ root, specPath }) {
  const inventory = inventoryLifecycleIdentities({ root });
  /** @type {FeatureDiagnostic[]} */
  const diagnostics = [...inventory.diagnostics];
  if (!parseSpecIdentity(specPath)) {
    diagnose(
      diagnostics,
      'FEATURE_QUERY_INVALID',
      'error',
      typeof specPath === 'string' ? specPath : String(specPath),
      'feature query must be exactly .dude/specs/<NNN>-<slug>/spec.md',
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
