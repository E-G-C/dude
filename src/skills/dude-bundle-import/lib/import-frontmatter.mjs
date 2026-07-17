// @ts-check

/**
 * This module recognizes only the canonical frontmatter accepted by bundle
 * import. It is intentionally narrower than YAML.
 *
 * Line spans are one-based and inclusive. Offset spans are zero-based and
 * half-open: `raw === content.slice(startOffset, endOffset)`. Entry offsets
 * include the terminating LF or CRLF after the entry's final physical line.
 */

const ENTRY_PATTERN = /^([A-Za-z0-9_-]+):(.*)$/;
const LICENSE_PATTERN = /^license: ([A-Za-z0-9][A-Za-z0-9.+-]*(?: [A-Za-z0-9][A-Za-z0-9.+-]*)*)$/;

/** @typedef {'plain'|'quoted'|'flow-sequence'|'block-sequence'} ImportFrontmatterValueKind */

/**
 * @typedef {object} ImportFrontmatterEntry
 * @property {string} key
 * @property {number} startLine One-based, inclusive physical line.
 * @property {number} endLine One-based, inclusive physical line.
 * @property {number} startOffset Zero-based, inclusive UTF-16 offset.
 * @property {number} endOffset Zero-based, exclusive UTF-16 offset.
 * @property {string} raw Exact source bytes represented as a JavaScript string.
 * @property {ImportFrontmatterValueKind} valueKind
 * @property {string|string[]} value Decoded quoted scalar or scalar sequence values; plain values retain their exact trimmed spelling.
 */

/**
 * @typedef {object} PhysicalLine
 * @property {string} text
 * @property {number} startOffset
 * @property {number} contentEndOffset
 * @property {number} endOffset
 */

/**
 * Stable rejection raised for present but noncanonical import frontmatter.
 */
export class ImportFrontmatterError extends Error {
  /**
   * @param {string} code
   * @param {number} line One-based physical line.
   * @param {string} detail
   */
  constructor(code, line, detail) {
    super(`Invalid import frontmatter at line ${line}: ${detail}`);
    this.name = 'ImportFrontmatterError';
    this.code = code;
    this.line = line;
  }
}

/** @returns {never} */
function reject(code, line, detail) {
  throw new ImportFrontmatterError(code, line, detail);
}

/**
 * Split without normalizing separators or offsets. LF and CRLF are the only
 * supported line endings; a bare CR anywhere, including a body-only document,
 * prevents a reliable physical-line proof and is rejected before absence.
 * @param {string} source
 * @returns {PhysicalLine[]}
 */
function splitPhysicalLines(source) {
  let line = 1;
  for (let offset = 0; offset < source.length; offset++) {
    if (source[offset] === '\r') {
      if (source[offset + 1] !== '\n') {
        reject(
          'ERR_IMPORT_FRONTMATTER_LINE_ENDING',
          line,
          'bare carriage returns are unsupported; use LF or CRLF line endings',
        );
      }
      offset++;
      line++;
    } else if (source[offset] === '\n') {
      line++;
    }
  }

  /** @type {PhysicalLine[]} */
  const lines = [];
  const separators = /\r\n|\n/g;
  let startOffset = 0;
  for (let match = separators.exec(source); match; match = separators.exec(source)) {
    lines.push({
      text: source.slice(startOffset, match.index),
      startOffset,
      contentEndOffset: match.index,
      endOffset: match.index + match[0].length,
    });
    startOffset = match.index + match[0].length;
  }
  lines.push({
    text: source.slice(startOffset),
    startOffset,
    contentEndOffset: source.length,
    endOffset: source.length,
  });
  return lines;
}

/** @param {string} text */
function isBlankOrComment(text) {
  return /^\s*(?:#.*)?$/.test(text);
}

/**
 * Classify a physical line as a *delimiter-shaped but noncanonical* marker. The
 * only canonical frontmatter delimiter is exactly `---` at column zero; every
 * other delimiter attempt must reject with a stable
 * `ERR_IMPORT_FRONTMATTER_DELIMITER` diagnostic rather than fall open to absence
 * (opening line) or be misparsed as an entry/body line (closing scan).
 *
 * A line qualifies when it is not the canonical `---` yet matches either shape:
 *
 *   1. Whitespace variants that collapse to `---` — e.g. ` ---`, `--- `, or
 *      ` --- `. The trim comparison preserves the parser's original
 *      leading/trailing-blank rejection so existing whitespace regressions keep
 *      failing closed (a leading-space `---` does not start with `---`).
 *   2. Column-zero three-hyphen markers carrying any trailing remainder — e.g.
 *      `--- # metadata`, `---x`, `----`, or `------`. Any line that begins with
 *      `---` and is longer than `---` is unambiguously a malformed delimiter,
 *      never an entry, body line, or absence.
 *
 * Ordinary content can never satisfy either shape: a line must trim to `---` or
 * begin with exactly three hyphens, so `-- x`, `- item`, and prose stay
 * unaffected. The predicate is deliberately shape-only and stateless; callers
 * decide whether an opening or closing context applies.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isNoncanonicalDelimiter(text) {
  if (text === '---') return false;
  return text.trim() === '---' || text.startsWith('---');
}

/**
 * @param {PhysicalLine[]} lines
 * @param {number} offset
 */
function lineIndexAtOffset(lines, offset) {
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];
    if (offset < line.startOffset) high = middle - 1;
    else if (offset > line.contentEndOffset) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(lines.length - 1, low));
}

/**
 * Parse a complete single-quoted scalar.
 * @param {string} scalar
 * @param {number} line
 */
function parseSingleQuotedScalar(scalar, line) {
  let value = '';
  for (let index = 1; index < scalar.length; index++) {
    if (scalar[index] !== "'") {
      value += scalar[index];
      continue;
    }
    if (scalar[index + 1] === "'") {
      value += "'";
      index++;
      continue;
    }
    if (index === scalar.length - 1) return value;
    reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
  }
  reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
}

/**
 * @param {string} scalar
 * @param {number} line
 * @returns {{ kind: 'plain'|'quoted', value: string }}
 */
function parseScalar(scalar, line) {
  const value = scalar.trim();
  if (value === '') {
    reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
  }

  if (value[0] === "'") {
    return { kind: 'quoted', value: parseSingleQuotedScalar(value, line) };
  }
  if (value[0] === '"') {
    try {
      const decoded = JSON.parse(value);
      if (typeof decoded === 'string') return { kind: 'quoted', value: decoded };
    } catch {
      // Fall through to the stable canonical-value diagnostic.
    }
    reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
  }

  if (
    /[\u0000-\u001f\u007f]/.test(value)
    || /^[\[\]{},#&*!|>'"%@`]/.test(value)
    || /^(?:-|\?|:)(?:\s|$)/.test(value)
    || /[\[\]{}]/.test(value)
    || /:(?:\s|$)/.test(value)
    || /(?:^|\s)#/.test(value)
    || /(?:^|\s)[&*!](?:\S|$)/.test(value)
  ) {
    reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
  }

  return { kind: 'plain', value };
}

/**
 * Parse a scalar-only flow sequence beginning at `startOffset`.
 * @param {string} source
 * @param {PhysicalLine[]} lines
 * @param {number} startOffset
 * @param {number} limitOffset
 * @returns {{ values: string[], endLineIndex: number }}
 */
function parseFlowSequence(source, lines, startOffset, limitOffset) {
  /** @type {string[]} */
  const values = [];
  let item = '';
  let itemLineIndex = -1;
  let quote = '';
  let escaped = false;
  let sawComma = false;

  /** @param {number} fallbackLineIndex */
  function consumeItem(fallbackLineIndex) {
    const scalar = item.trim();
    if (scalar === '') {
      reject(
        'ERR_IMPORT_FRONTMATTER_VALUE',
        fallbackLineIndex + 1,
        'expected a supported scalar value',
      );
    }
    values.push(parseScalar(
      scalar,
      (itemLineIndex < 0 ? fallbackLineIndex : itemLineIndex) + 1,
    ).value);
    item = '';
    itemLineIndex = -1;
  }

  for (let index = startOffset + 1; index < limitOffset; index++) {
    const character = source[index];
    const lineIndex = lineIndexAtOffset(lines, index);
    const line = lineIndex + 1;

    if (quote === '"') {
      if (character === '\r' || character === '\n') {
        reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
      }
      item += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = '';
      continue;
    }
    if (quote === "'") {
      if (character === '\r' || character === '\n') {
        reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
      }
      item += character;
      if (character !== "'") continue;
      if (source[index + 1] === "'") {
        item += source[index + 1];
        index++;
      }
      else quote = '';
      continue;
    }

    if (character === '"' || character === "'") {
      if (itemLineIndex < 0) itemLineIndex = lineIndex;
      item += character;
      quote = character;
      continue;
    }
    if (
      character === '#'
      && /^\s*$/.test(source.slice(lines[lineIndex].startOffset, index))
    ) {
      item += source.slice(lines[lineIndex].contentEndOffset, lines[lineIndex].endOffset);
      index = lines[lineIndex].endOffset - 1;
      continue;
    }
    if (character === '[' || character === '{' || character === '}') {
      reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
    }
    if (character === ',') {
      consumeItem(lineIndex);
      sawComma = true;
      continue;
    }
    if (character !== ']') {
      item += character;
      if (itemLineIndex < 0 && !/\s/.test(character)) itemLineIndex = lineIndex;
      continue;
    }

    if (item.trim() !== '') {
      consumeItem(lineIndex);
    } else if (sawComma && values.length === 0) {
      reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
    }

    const physicalLine = lines[lineIndex];
    if (source.slice(index + 1, physicalLine.contentEndOffset).trim() !== '') {
      reject('ERR_IMPORT_FRONTMATTER_VALUE', line, 'expected a supported scalar value');
    }
    return { values, endLineIndex: lineIndex };
  }

  reject(
    'ERR_IMPORT_FRONTMATTER_VALUE',
    lineIndexAtOffset(lines, startOffset) + 1,
    'expected a supported scalar value',
  );
}

/**
 * @param {string} source
 * @param {PhysicalLine[]} lines
 * @param {number} lineIndex
 * @param {number} endLineIndex
 * @param {string} key
 * @param {ImportFrontmatterValueKind} valueKind
 * @param {string|string[]} value
 * @returns {ImportFrontmatterEntry}
 */
function makeEntry(source, lines, lineIndex, endLineIndex, key, valueKind, value) {
  const startOffset = lines[lineIndex].startOffset;
  const endOffset = lines[endLineIndex].endOffset;
  return {
    key,
    startLine: lineIndex + 1,
    endLine: endLineIndex + 1,
    startOffset,
    endOffset,
    raw: source.slice(startOffset, endOffset),
    valueKind,
    value,
  };
}

/**
 * @param {string} source
 * @param {PhysicalLine[]} lines
 * @param {number} lineIndex
 * @param {number} closingLineIndex
 * @returns {{ entry: ImportFrontmatterEntry, nextLineIndex: number }}
 */
function parseToolsBlock(source, lines, lineIndex, closingLineIndex) {
  let cursor = lineIndex + 1;
  while (cursor < closingLineIndex && isBlankOrComment(lines[cursor].text)) cursor++;
  if (cursor >= closingLineIndex) {
    reject('ERR_IMPORT_FRONTMATTER_VALUE', lineIndex + 1, 'expected a supported scalar value');
  }
  if (!/^  - /.test(lines[cursor].text)) {
    if (/^\s/.test(lines[cursor].text)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_INDENTATION',
        cursor + 1,
        'indented data is only allowed in a tools sequence',
      );
    }
    reject('ERR_IMPORT_FRONTMATTER_VALUE', lineIndex + 1, 'expected a supported scalar value');
  }

  /** @type {string[]} */
  const values = [];
  let finalItemLine = cursor;
  while (cursor < closingLineIndex) {
    const text = lines[cursor].text;
    const item = /^  - (.*)$/.exec(text);
    if (item) {
      values.push(parseScalar(item[1], cursor + 1).value);
      finalItemLine = cursor;
      cursor++;
      continue;
    }
    if (isBlankOrComment(text)) {
      let nextDataLine = cursor + 1;
      while (nextDataLine < closingLineIndex && isBlankOrComment(lines[nextDataLine].text)) {
        nextDataLine++;
      }
      if (nextDataLine < closingLineIndex && /^  - /.test(lines[nextDataLine].text)) {
        cursor = nextDataLine;
        continue;
      }
      break;
    }
    if (/^\s/.test(text)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_INDENTATION',
        cursor + 1,
        'indented data is only allowed in a tools sequence',
      );
    }
    break;
  }

  return {
    entry: makeEntry(
      source,
      lines,
      lineIndex,
      finalItemLine,
      'tools',
      'block-sequence',
      values,
    ),
    nextLineIndex: finalItemLine + 1,
  };
}

/**
 * Validate and parse import-private canonical frontmatter.
 *
 * Missing frontmatter and a validated document with no license are successful
 * results. Present malformed frontmatter throws `ImportFrontmatterError`.
 *
 * @param {string} content
 * @returns {{
 *   present: boolean,
 *   frontmatter: null|{
 *     startLine: number,
 *     endLine: number,
 *     startOffset: number,
 *     endOffset: number,
 *     raw: string,
 *   },
 *   entries: ImportFrontmatterEntry[],
 *   license: {status:'absent'}|{status:'present',value:string},
 * }}
 */
export function parseImportFrontmatter(content) {
  const source = String(content);
  const lines = splitPhysicalLines(source);
  if (lines[0].text !== '---') {
    if (isNoncanonicalDelimiter(lines[0].text)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_DELIMITER',
        1,
        "frontmatter delimiters must be exactly '---' at column zero",
      );
    }
    return {
      present: false,
      frontmatter: null,
      entries: [],
      license: { status: 'absent' },
    };
  }

  let closingLineIndex = -1;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex].text === '---') {
      closingLineIndex = lineIndex;
      break;
    }
    if (isNoncanonicalDelimiter(lines[lineIndex].text)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_DELIMITER',
        lineIndex + 1,
        "frontmatter delimiters must be exactly '---' at column zero",
      );
    }
  }
  if (closingLineIndex < 0) {
    reject(
      'ERR_IMPORT_FRONTMATTER_UNTERMINATED',
      1,
      'opening delimiter has no exact column-zero closing delimiter',
    );
  }

  for (let lineIndex = 1; lineIndex < closingLineIndex; lineIndex++) {
    if (lines[lineIndex].text.includes('\t')) {
      reject(
        'ERR_IMPORT_FRONTMATTER_TAB',
        lineIndex + 1,
        'tabs are not allowed in frontmatter structure',
      );
    }
  }

  /** @type {ImportFrontmatterEntry[]} */
  const entries = [];
  const keys = new Set();
  /** @type {{status:'absent'}|{status:'present',value:string}} */
  let license = { status: 'absent' };

  let lineIndex = 1;
  while (lineIndex < closingLineIndex) {
    const line = lines[lineIndex];
    if (isBlankOrComment(line.text)) {
      lineIndex++;
      continue;
    }
    if (/^\s/.test(line.text)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_INDENTATION',
        lineIndex + 1,
        'indented data is only allowed in a tools sequence',
      );
    }

    const match = ENTRY_PATTERN.exec(line.text);
    if (!match) {
      reject(
        'ERR_IMPORT_FRONTMATTER_ENTRY',
        lineIndex + 1,
        "expected an unquoted ASCII key immediately followed by ':'",
      );
    }
    const [, key, remainder] = match;
    if (keys.has(key)) {
      reject(
        'ERR_IMPORT_FRONTMATTER_DUPLICATE_KEY',
        lineIndex + 1,
        `duplicate top-level key '${key}'`,
      );
    }
    keys.add(key);

    if (key === 'license') {
      const canonical = LICENSE_PATTERN.exec(line.text);
      if (!canonical) {
        reject(
          'ERR_IMPORT_FRONTMATTER_LICENSE',
          lineIndex + 1,
          "license must use exactly 'license: VALUE' with a nonempty ASCII plain scalar",
        );
      }
      entries.push(makeEntry(source, lines, lineIndex, lineIndex, key, 'plain', canonical[1]));
      license = { status: 'present', value: canonical[1] };
      lineIndex++;
      continue;
    }

    const leadingWhitespace = /^ */.exec(remainder)?.[0].length ?? 0;
    const valueText = remainder.slice(leadingWhitespace);
    if (valueText === '') {
      if (key !== 'tools') {
        reject('ERR_IMPORT_FRONTMATTER_VALUE', lineIndex + 1, 'expected a supported scalar value');
      }
      const parsed = parseToolsBlock(source, lines, lineIndex, closingLineIndex);
      entries.push(parsed.entry);
      lineIndex = parsed.nextLineIndex;
      continue;
    }

    if (valueText[0] === '[') {
      const valueOffset = line.startOffset + match[1].length + 1 + leadingWhitespace;
      const parsed = parseFlowSequence(
        source,
        lines,
        valueOffset,
        lines[closingLineIndex].startOffset,
      );
      if (key !== 'tools' && parsed.endLineIndex !== lineIndex) {
        reject('ERR_IMPORT_FRONTMATTER_VALUE', lineIndex + 1, 'expected a supported scalar value');
      }
      entries.push(makeEntry(
        source,
        lines,
        lineIndex,
        parsed.endLineIndex,
        key,
        'flow-sequence',
        parsed.values,
      ));
      lineIndex = parsed.endLineIndex + 1;
      continue;
    }

    const scalar = parseScalar(valueText, lineIndex + 1);
    entries.push(makeEntry(source, lines, lineIndex, lineIndex, key, scalar.kind, scalar.value));
    lineIndex++;
  }

  const endOffset = lines[closingLineIndex].endOffset;
  return {
    present: true,
    frontmatter: {
      startLine: 1,
      endLine: closingLineIndex + 1,
      startOffset: 0,
      endOffset,
      raw: source.slice(0, endOffset),
    },
    entries,
    license,
  };
}

/**
 * Remove validated top-level entry spans while preserving every other source
 * character, including the original LF or CRLF separators.
 *
 * @param {string} content
 * @param {readonly string[]} keys
 * @returns {string}
 */
export function stripImportFrontmatter(content, keys) {
  const source = String(content);
  const parsed = parseImportFrontmatter(source);
  if (!parsed.present || keys.length === 0) return source;

  const selectedKeys = new Set(keys);
  const selectedEntries = parsed.entries.filter(({ key }) => selectedKeys.has(key));
  if (selectedEntries.length === 0) return source;

  let cursor = 0;
  let stripped = '';
  for (const entry of selectedEntries) {
    stripped += source.slice(cursor, entry.startOffset);
    cursor = entry.endOffset;
  }
  return stripped + source.slice(cursor);
}
