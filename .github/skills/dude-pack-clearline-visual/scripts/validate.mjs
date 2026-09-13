#!/usr/bin/env node
/**
 * Clearline's canonical token and example validator.
 *
 * The parity scope is deliberately finite: it covers the shared roles listed
 * in the report below, not every format-specific token.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, '..');
const tokenDirectory = path.join(skillRoot, 'tokens');
const exampleDirectory = path.join(skillRoot, 'examples');
const require = createRequire(import.meta.url);

const canonicalFiles = {
  json: path.join(tokenDirectory, 'clearline-tokens.json'),
  css: path.join(tokenDirectory, 'clearline.css'),
  scss: path.join(tokenDirectory, 'clearline.scss'),
  tailwind: path.join(tokenDirectory, 'tailwind.preset.cjs'),
};

const exampleFiles = [
  'button-styles.html',
  'header-footer.html',
  'placeholder-mark.svg',
  'themed-page.html',
];

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function readCanonicalFile(label, file) {
  try {
    const stats = fs.lstatSync(file);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      fail(`${label} must be a regular file`);
    }
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    fail(`${label} is missing or unreadable: ${error.message}`);
  }
}

function structuralSanity(source, label, supportsLineComments) {
  let braces = 0;
  let parentheses = 0;
  let quote = null;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === '\\') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (supportsLineComments && character === '/' && next === '/') {
      const newline = source.indexOf('\n', index + 2);
      index = newline === -1 ? source.length : newline;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '{') braces += 1;
    if (character === '}') braces -= 1;
    if (character === '(') parentheses += 1;
    if (character === ')') parentheses -= 1;

    if (braces < 0) fail(`${label} has an unmatched closing brace`);
    if (parentheses < 0) fail(`${label} has an unmatched closing parenthesis`);
  }

  if (blockComment) fail(`${label} has an unterminated block comment`);
  if (quote) fail(`${label} has an unterminated string`);
  if (braces !== 0) fail(`${label} has unmatched braces`);
  if (parentheses !== 0) fail(`${label} has unmatched parentheses`);
}

function tokenAt(tokens, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    expect(
      value && typeof value === 'object' && key in value,
      `missing JSON token ${dottedPath}`,
    );
    return value[key];
  }, tokens);
}

function resolveJson(tokens, dottedPath, seen = new Set()) {
  expect(!seen.has(dottedPath), `circular JSON token reference at ${dottedPath}`);
  const token = tokenAt(tokens, dottedPath);
  expect(
    token && typeof token === 'object' && '$value' in token,
    `JSON token ${dottedPath} has no $value`,
  );
  const value = token.$value;
  if (typeof value !== 'string') return value;
  const reference = /^\{([^}]+)\}$/.exec(value);
  return reference
    ? resolveJson(tokens, reference[1], new Set([...seen, dottedPath]))
    : value;
}

function declaration(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^\\s*${escaped}\\s*:\\s*([^;]+);`, 'm'));
  expect(match, `missing declaration ${name}`);
  return match[1].trim();
}

function resolveCss(css, name, seen = new Set()) {
  expect(!seen.has(name), `circular CSS token reference at ${name}`);
  const value = declaration(css, `--cl-${name}`);
  const reference = /^var\(--cl-([a-z0-9-]+)\)$/i.exec(value);
  return reference
    ? resolveCss(css, reference[1], new Set([...seen, name]))
    : value;
}

function resolveScss(scss, name, seen = new Set()) {
  expect(!seen.has(name), `circular SCSS token reference at ${name}`);
  const value = declaration(scss, `$cl-${name}`);
  const reference = /^\$cl-([a-z0-9-]+)$/i.exec(value);
  return reference
    ? resolveScss(scss, reference[1], new Set([...seen, name]))
    : value;
}

function normalize(value) {
  return String(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeFont(value) {
  return normalize(value).replace(/["']/g, '');
}

function equal(actual, expected, label, normalizer = normalize) {
  if (normalizer(actual) !== normalizer(expected)) {
    fail(`${label}: expected ${expected}, received ${actual}`);
  }
}

function objectGroup(value, label) {
  expect(
    value && typeof value === 'object' && !Array.isArray(value),
    `Tailwind preset is missing ${label}`,
  );
  return value;
}

function hexColor(value, label) {
  const normalized = String(value).trim();
  expect(/^#[0-9a-f]{6}$/i.test(normalized), `${label} must resolve to a six-digit hex color`);
  return normalized.toUpperCase();
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g);
  expect(channels && channels.length === 3, `invalid hex color ${hex}`);
  const linear = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function blockAfter(source, anchor, label) {
  const start = source.indexOf(anchor);
  expect(start !== -1, `missing CSS rule for ${label}`);
  const open = anchor.endsWith('{')
    ? start + anchor.length - 1
    : source.indexOf('{', start + anchor.length);
  expect(open !== -1, `missing opening brace for ${label}`);
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }

  fail(`missing closing brace for ${label}`);
}

function rawColorLiterals(value) {
  const withoutFragments = value.replace(/url\(\s*["']?#[^)]*\)/gi, '');
  const hex = withoutFragments.match(
    /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/gi,
  ) ?? [];
  const rgb = withoutFragments.match(/\brgba?\s*\(/gi) ?? [];
  return [...hex, ...rgb];
}

function relevantStyleProperty(property) {
  return property.startsWith('--')
    || /(accent|background|border|caret|color|column-rule|fill|filter|outline|shadow|stroke)/i
      .test(property);
}

function inspectStyleDeclarations(source, context, findings) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = /(?:^|[;{}])\s*([-\w]+)\s*:\s*([^;{}]+)/g;

  for (const match of withoutComments.matchAll(declarations)) {
    const [, property, value] = match;
    if (!relevantStyleProperty(property)) continue;
    for (const literal of rawColorLiterals(value)) {
      findings.push(`${context} ${property}=${literal}`);
    }
  }
}

function htmlAttribute(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attributes.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(["'])([^"']*)\\1`, 'i'),
  );
  return match?.[2] ?? null;
}

function inspectThemedPageInteractions(source) {
  const ids = new Set(
    [...source.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)]
      .map((match) => match[2]),
  );
  const controls = [
    ...source.matchAll(/<(a|button|input|select|textarea|form)\b([^>]*)>/gi),
  ];

  expect(
    controls.length === 2,
    'themed-page must contain exactly two local action links',
  );
  for (const [, tag, attributes] of controls) {
    expect(
      tag.toLowerCase() === 'a',
      `themed-page ${tag} control has no honest local behavior`,
    );
    const href = htmlAttribute(attributes, 'href');
    expect(
      href && /^#[A-Za-z][\w-]*$/.test(href),
      'themed-page link must use a local fragment destination',
    );
    const target = href?.slice(1) ?? '';
    expect(
      ids.has(target),
      `themed-page link targets missing section #${target}`,
    );
  }
}

function inspectExamples() {
  const findings = [];
  const presentationAttributes = /(?:accent-color|color|fill|flood-color|lighting-color|stop-color|stroke)/i;

  for (const file of exampleFiles) {
    const source = readCanonicalFile(`example ${file}`, path.join(exampleDirectory, file));
    const markup = source.replace(/<!--[\s\S]*?-->/g, '');

    for (const match of markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
      inspectStyleDeclarations(match[1], `${file} <style>`, findings);
    }

    for (const tag of markup.matchAll(/<[A-Za-z][\w:-]*\b[^>]*>/g)) {
      const attributes = tag[0];

      for (const style of attributes.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
        inspectStyleDeclarations(style[2], `${file} style attribute`, findings);
      }

      for (const attribute of attributes.matchAll(/\b([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
        const [, name, , value] = attribute;
        if (!presentationAttributes.test(name)) continue;
        for (const literal of rawColorLiterals(value)) {
          findings.push(`${file} ${name}=${literal}`);
        }
      }
    }

    if (file === 'themed-page.html') inspectThemedPageInteractions(markup);
  }

  expect(
    findings.length === 0,
    `raw color literal(s) in shipped examples: ${findings.join('; ')}`,
  );
}

function validate() {
  const jsonSource = readCanonicalFile('clearline-tokens.json', canonicalFiles.json);
  const css = readCanonicalFile('clearline.css', canonicalFiles.css);
  const scss = readCanonicalFile('clearline.scss', canonicalFiles.scss);
  const tailwindSource = readCanonicalFile('tailwind.preset.cjs', canonicalFiles.tailwind);

  let tokens;
  try {
    tokens = JSON.parse(jsonSource);
  } catch (error) {
    fail(`clearline-tokens.json is invalid JSON: ${error.message}`);
  }

  structuralSanity(css, 'clearline.css', false);
  structuralSanity(scss, 'clearline.scss', true);
  expect(/:root\s*\{/.test(css), 'clearline.css is missing its :root token block');
  expect(/^\s*\$cl-[\w-]+\s*:/m.test(scss), 'clearline.scss is missing token declarations');

  let tailwind;
  try {
    tailwind = require(canonicalFiles.tailwind);
  } catch (error) {
    fail(`tailwind.preset.cjs cannot be loaded with CommonJS require: ${error.message}`);
  }

  const extension = objectGroup(tailwind?.theme?.extend, 'theme.extend');
  const colors = objectGroup(extension.colors?.cl, 'colors.cl');
  const fontFamily = objectGroup(extension.fontFamily, 'fontFamily');
  const fontWeight = objectGroup(extension.fontWeight, 'fontWeight');
  const spacing = objectGroup(extension.spacing, 'spacing');
  const radius = objectGroup(extension.borderRadius, 'borderRadius');
  const height = objectGroup(extension.height, 'height');
  const minWidth = objectGroup(extension.minWidth, 'minWidth');
  const borderWidth = objectGroup(extension.borderWidth, 'borderWidth');
  const outlineWidth = objectGroup(extension.outlineWidth, 'outlineWidth');
  const outlineOffset = objectGroup(extension.outlineOffset, 'outlineOffset');
  const duration = objectGroup(extension.transitionDuration, 'transitionDuration');
  const easing = objectGroup(extension.transitionTimingFunction, 'transitionTimingFunction');

  const parity = (label, jsonPath, cssName, scssName, tailwindValue, normalizer) => {
    const jsonValue = resolveJson(tokens, jsonPath);
    equal(resolveCss(css, cssName), jsonValue, `CSS ${label}`, normalizer);
    equal(resolveScss(scss, scssName), jsonValue, `SCSS ${label}`, normalizer);
    equal(tailwindValue, jsonValue, `Tailwind ${label}`, normalizer);
    return jsonValue;
  };

  const contrastReport = [];
  const reportContrast = (label, first, second, minimum) => {
    const ratio = contrast(hexColor(first, label), hexColor(second, label));
    expect(ratio >= minimum, `${label} contrast is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
    contrastReport.push({ label, ratio, minimum });
  };

  const semanticPairs = ['primary', 'success', 'warning', 'danger'];
  for (const role of semanticPairs) {
    const background = parity(
      `${role} background`,
      `color.semantic.${role}.background`,
      `color-${role}-bg`,
      `color-${role}-bg`,
      colors[`${role}-bg`],
    );
    const foreground = parity(
      `${role} foreground`,
      `color.semantic.${role}.foreground`,
      `color-${role}-fg`,
      `color-${role}-fg`,
      colors[`${role}-fg`],
    );
    reportContrast(`semantic ${role}`, foreground, background, 4.5);
  }

  const lightSurface = parity('light surface', 'color.neutral.bg', 'bg', 'bg', colors.bg);
  const lightSubtleSurface = parity(
    'light subtle surface',
    'color.neutral.bg-subtle',
    'bg-subtle',
    'bg-subtle',
    colors['bg-subtle'],
  );
  const darkSurface = parity(
    'dark surface',
    'color.neutral.bg-dark',
    'bg-dark',
    'bg-dark',
    colors['bg-dark'],
  );
  const darkSubtleSurface = parity(
    'dark subtle surface',
    'color.neutral.bg-subtle-dark',
    'bg-subtle-dark',
    'bg-subtle-dark',
    colors['bg-subtle-dark'],
  );

  const linkRoles = [
    ['link on light', 'color.semantic.link.foreground', 'color-link', 'link', [lightSurface, lightSubtleSurface]],
    [
      'link on dark',
      'color.semantic.link.foreground-on-dark',
      'color-link-on-dark',
      'link-on-dark',
      [darkSurface, darkSubtleSurface],
    ],
  ];
  for (const [label, jsonPath, cssName, tailwindName, surfaces] of linkRoles) {
    const link = parity(label, jsonPath, cssName, cssName, colors[tailwindName]);
    for (const surface of surfaces) reportContrast(`${label} / ${surface}`, link, surface, 4.5);
  }

  const controlBorders = [
    [
      'control border light',
      'color.semantic.control.border',
      'color-control-border',
      'control-border',
      [lightSurface, lightSubtleSurface],
    ],
    [
      'control border dark',
      'color.semantic.control.border-on-dark',
      'color-control-border-on-dark',
      'control-border-on-dark',
      [darkSurface, darkSubtleSurface],
    ],
  ];
  for (const [label, jsonPath, cssName, tailwindName, surfaces] of controlBorders) {
    const border = parity(label, jsonPath, cssName, cssName, colors[tailwindName]);
    for (const surface of surfaces) reportContrast(`${label} / ${surface}`, border, surface, 3);
  }

  const focusRoles = [
    [
      'focus ring light',
      'color.semantic.focus.ring',
      'color-focus-ring',
      'focus-ring',
      [lightSurface, lightSubtleSurface],
    ],
    [
      'focus halo light fallback',
      'color.semantic.focus.halo',
      'color-focus-halo',
      'focus-halo',
      [darkSurface, darkSubtleSurface],
    ],
    [
      'focus ring dark',
      'color.semantic.focus.ring-on-dark',
      'color-focus-ring-on-dark',
      'focus-ring-on-dark',
      [darkSurface, darkSubtleSurface],
    ],
    [
      'focus halo dark fallback',
      'color.semantic.focus.halo-on-dark',
      'color-focus-halo-on-dark',
      'focus-halo-on-dark',
      [lightSurface, lightSubtleSurface],
    ],
  ];
  for (const [label, jsonPath, cssName, tailwindName, surfaces] of focusRoles) {
    const focus = parity(label, jsonPath, cssName, cssName, colors[tailwindName]);
    for (const surface of surfaces) reportContrast(`${label} / ${surface}`, focus, surface, 3);
  }

  const focusBlock = blockAfter(
    css,
    '.cl-brand :where(a, button, input, select, textarea, [tabindex]):focus-visible,',
    'two-tone focus indicator',
  );
  equal(
    declaration(focusBlock, 'outline'),
    'var(--cl-focus-ring-width) solid var(--cl-color-focus-ring)',
    'CSS focus outline',
  );
  equal(
    declaration(focusBlock, 'box-shadow'),
    '0 0 0 var(--cl-focus-ring-width) var(--cl-color-focus-halo)',
    'CSS focus halo',
  );
  expect(
    /--cl-color-focus-ring:\s*var\(--cl-color-focus-ring-on-dark\);/.test(css),
    'dark Clearline context must activate the dark focus ring',
  );
  expect(
    /--cl-color-focus-halo:\s*var\(--cl-color-focus-halo-on-dark\);/.test(css),
    'dark Clearline context must activate the dark focus halo',
  );

  const secondaryButton = blockAfter(css, '.cl-btn-secondary', 'secondary button');
  equal(
    declaration(secondaryButton, 'border-color'),
    'var(--cl-color-control-border)',
    'secondary button control border',
  );
  const defaultControls = blockAfter(
    css,
    '.cl-btn,\n.cl-input {',
    'default controls',
  );
  equal(
    declaration(defaultControls, 'box-sizing'),
    'border-box',
    'default controls box sizing',
  );
  const button = blockAfter(css, '.cl-btn {', 'button control');
  equal(
    declaration(button, 'height'),
    'var(--cl-control-height-default)',
    'button default control height',
  );
  const input = blockAfter(css, '.cl-input', 'input control');
  equal(
    declaration(input, 'border'),
    'var(--cl-control-border-width) solid var(--cl-color-control-border)',
    'input control border',
  );
  equal(
    declaration(input, 'min-height'),
    'var(--cl-control-height-default)',
    'input default control minimum height',
  );

  for (const key of ['none', 'reduced', 'micro', 'standard', 'entrance']) {
    parity(`motion duration ${key}`, `motion.duration.${key}`, `dur-${key}`, `dur-${key}`, duration[`cl-${key}`]);
  }
  for (const key of ['enter', 'exit']) {
    parity(`motion easing ${key}`, `motion.easing.${key}`, `ease-${key}`, `ease-${key}`, easing[`cl-${key}`]);
  }

  for (const variant of ['compact', 'default', 'hero']) {
    const size = parity(
      `mark size ${variant}`,
      `mark.size.${variant}`,
      `mark-size-${variant}`,
      `mark-size-${variant}`,
      spacing[`cl-mark-size-${variant}`],
    );
    const clearSpace = parity(
      `mark clear space ${variant}`,
      `mark.clearSpace.${variant}`,
      `mark-clear-space-${variant}`,
      `mark-clear-space-${variant}`,
      spacing[`cl-mark-clear-space-${variant}`],
    );
    equal(clearSpace, size, `mark ${variant} clear-space pair`);
  }

  const lockup = blockAfter(css, '.cl-lockup {', 'default lockup');
  equal(
    declaration(lockup, '--cl-mark-size'),
    'var(--cl-mark-size-default)',
    'default lockup mark size',
  );
  equal(
    declaration(lockup, '--cl-mark-clear-space'),
    'var(--cl-mark-clear-space-default)',
    'default lockup clear space',
  );
  const retiredMarkSizeAttribute = `data-cl-mark-${'size'}`;
  expect(
    !css.includes(retiredMarkSizeAttribute),
    'CSS retains the retired mark-size data attribute',
  );
  for (const variant of ['compact', 'hero']) {
    const modifier = blockAfter(css, `.cl-lockup--${variant} {`, `${variant} lockup`);
    equal(
      declaration(modifier, '--cl-mark-size'),
      `var(--cl-mark-size-${variant})`,
      `${variant} lockup mark size`,
    );
    equal(
      declaration(modifier, '--cl-mark-clear-space'),
      `var(--cl-mark-clear-space-${variant})`,
      `${variant} lockup clear space`,
    );
  }
  const placeholder = blockAfter(css, '.cl-mark-placeholder', 'mark placeholder');
  equal(declaration(placeholder, 'box-sizing'), 'border-box', 'mark placeholder box sizing');

  const fontRoles = [
    ['body', 'font.family.body', 'font-body', 'cl-body'],
    ['heading', 'font.family.heading', 'font-heading', 'cl-heading'],
    ['mono', 'font.family.mono', 'font-mono', 'cl-mono'],
    ['docs', 'font.family.docs', 'font-docs', 'cl-docs'],
  ];
  for (const [label, jsonPath, name, tailwindName] of fontRoles) {
    parity(`font family ${label}`, jsonPath, name, name, fontFamily[tailwindName], normalizeFont);
  }
  const documentationCode = blockAfter(
    css,
    '.cl-docs pre,\n.cl-docs code {',
    'documentation code',
  );
  equal(
    declaration(documentationCode, 'font-family'),
    'var(--cl-font-mono)',
    'documentation code font family',
  );
  const documentationTierMargins = blockAfter(
    css,
    '.cl-docs-content > :where(blockquote, figure) {',
    'documentation quote and figure horizontal normalization',
  );
  equal(
    declaration(documentationTierMargins, 'margin-inline'),
    '0',
    'documentation quote and figure horizontal margins',
  );
  expect(
    !/^\s*margin(?:-block)?\s*:/m.test(documentationTierMargins),
    'documentation quote and figure normalization must preserve vertical margins',
  );
  const retiredDocumentationCodeToken = `docs-${'mono'}`;
  for (const [label, source] of [
    ['JSON', jsonSource],
    ['CSS', css],
    ['SCSS', scss],
    ['Tailwind', tailwindSource],
  ]) {
    expect(
      !source.includes(retiredDocumentationCodeToken),
      `${label} retains a retired documentation code token`,
    );
  }
  for (const [label, jsonPath, name, tailwindName] of [
    ['regular', 'font.weight.regular', 'fw-regular', 'cl-regular'],
    ['semibold', 'font.weight.semibold', 'fw-semibold', 'cl-semibold'],
  ]) {
    parity(`font weight ${label}`, jsonPath, name, name, fontWeight[tailwindName]);
  }
  equal(
    Object.keys(tokenAt(tokens, 'font.weight')).sort().join(','),
    'regular,semibold',
    'JSON font weight roles',
  );
  equal(
    Object.keys(fontWeight).sort().join(','),
    'cl-regular,cl-semibold',
    'Tailwind font weight roles',
  );

  for (const key of ['0', '1', '2', '3', '4', '5', '6', '7', '8']) {
    parity(`spacing ${key}`, `space.${key}`, `space-${key}`, `space-${key}`, spacing[`cl-${key}`]);
  }
  for (const key of ['sm', 'md', 'lg', 'pill']) {
    parity(`radius ${key}`, `radius.${key}`, `radius-${key}`, `radius-${key}`, radius[`cl-${key}`]);
  }
  const controlHeights = {};
  for (const key of ['compact', 'default', 'touch']) {
    controlHeights[key] = parity(
      `control height ${key}`,
      `component.control.height.${key}`,
      `control-height-${key}`,
      `control-height-${key}`,
      height[`cl-control-${key}`],
    );
  }
  equal(
    controlHeights.default,
    '40px',
    'default control outer height',
  );
  parity(
    'card minimum width',
    'component.card.minWidth',
    'card-min-width',
    'card-min-width',
    minWidth['cl-card'],
  );
  parity(
    'control border width',
    'component.control.borderWidth',
    'control-border-width',
    'control-border-width',
    borderWidth['cl-control'],
  );
  parity(
    'focus ring width',
    'component.focus.ringWidth',
    'focus-ring-width',
    'focus-ring-width',
    outlineWidth['cl-focus'],
  );
  parity(
    'focus ring offset',
    'component.focus.ringOffset',
    'focus-ring-offset',
    'focus-ring-offset',
    outlineOffset['cl-focus'],
  );

  expect(!/\.cl-docs-tabs\b|\.cl-docs-tab\b|\[role="tab(?:list)?"]/.test(css), 'CSS retains a generic tab adapter');
  expect(!/\$cl-colors\s*:/.test(scss), 'SCSS retains the incomplete $cl-colors map');
  inspectExamples();

  return contrastReport;
}

if (process.argv.length !== 2) {
  console.error('Usage: node validate.mjs');
  process.exitCode = 2;
} else {
  try {
    const contrastReport = validate();
    console.log('== Clearline canonical validation ==');
    console.log('Checked files: JSON parsing; CSS/SCSS structural sanity; CommonJS Tailwind loading from ESM.');
    console.log('Checked parity scope: semantic fills and links; light/dark Clearline surfaces; control borders; focus ring/halo roles; motion; mark pairs; font families and 400/600 weights; spacing, radii, control and card sizes, and focus geometry.');
    console.log('Checked CSS implementation: shared-left-edge quote/figure horizontal normalization, two-tone focus, semantic secondary/input borders, border-box default controls and placeholder sizing, paired class lockup variants, and no tab adapter.');
    console.log('Checked examples: no raw hex/rgb/rgba in color declarations in <style>, style attributes, and SVG/HTML presentation attributes.');
    console.log('Checked themed page interactions: two local action links target existing sections; no button or form controls.');
    console.log('Contrast report:');
    for (const { label, ratio, minimum } of contrastReport) {
      console.log(`  ${label}: ${ratio.toFixed(2)}:1 (>= ${minimum}:1)`);
    }
    console.log('OK: Clearline canonical validation passed.');
  } catch (error) {
    console.error(`FAIL: Clearline canonical validation: ${error.message}`);
    process.exitCode = 1;
  }
}
