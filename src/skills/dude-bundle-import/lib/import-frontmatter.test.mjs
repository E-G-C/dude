// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ImportFrontmatterError,
  parseImportFrontmatter,
  stripImportFrontmatter,
} from './import-frontmatter.mjs';

/**
 * @param {string} content
 * @param {{ code: string, line: number, message: string }} expected
 */
function assertRejected(content, expected) {
  assert.throws(
    () => parseImportFrontmatter(content),
    (error) => {
      assert.ok(error instanceof ImportFrontmatterError);
      assert.equal(error.code, expected.code);
      assert.equal(error.line, expected.line);
      assert.equal(error.message, expected.message);
      return true;
    },
  );
}

test('parseImportFrontmatter treats missing frontmatter as valid absence', () => {
  const content = '# Body only\n\n---\nThis is a body rule, not frontmatter.\n';

  assert.deepEqual(parseImportFrontmatter(content), {
    present: false,
    frontmatter: null,
    entries: [],
    license: { status: 'absent' },
  });
  assert.equal(stripImportFrontmatter(content, ['license']), content);
});

test('parseImportFrontmatter and stripImportFrontmatter reject bare CR before absence classification', async (t) => {
  const fixtures = [
    ['CR-only delimiter-shaped frontmatter', '---\rname: Example\rlicense: MIT\r---\rBody\r'],
    ['body-only document with a bare CR', '# Body only\rStill body'],
  ];
  const expected = {
    code: 'ERR_IMPORT_FRONTMATTER_LINE_ENDING',
    line: 1,
    message: 'Invalid import frontmatter at line 1: bare carriage returns are unsupported; use LF or CRLF line endings',
  };

  for (const [name, content] of fixtures) {
    await t.test(name, () => {
      for (const operation of [
        () => parseImportFrontmatter(content),
        () => stripImportFrontmatter(content, ['license']),
      ]) {
        assert.throws(operation, (error) => {
          assert.ok(error instanceof ImportFrontmatterError);
          assert.equal(error.code, expected.code);
          assert.equal(error.line, expected.line);
          assert.equal(error.message, expected.message);
          return true;
        });
      }
    });
  }
});

test('parseImportFrontmatter proves license absence only after full validation', () => {
  const content = [
    '---',
    '# canonical metadata without a license',
    'name: Example',
    '',
    'description: "No license is declared"',
    '---',
    'Body',
    '',
  ].join('\n');
  const parsed = parseImportFrontmatter(content);

  assert.equal(parsed.present, true);
  assert.deepEqual(parsed.license, { status: 'absent' });
  assert.deepEqual(parsed.entries.map(({ key }) => key), ['name', 'description']);
  assert.equal(parsed.frontmatter?.startLine, 1);
  assert.equal(parsed.frontmatter?.endLine, 6);
});

test('parseImportFrontmatter accepts ordinary one-line scalar forms only', () => {
  const content = [
    '---',
    'plain: A plain value',
    'single: \'A quoted value\'',
    'double: "Another quoted value"',
    'flow: [one, "two", \'three\']',
    '---',
    '',
  ].join('\n');
  const parsed = parseImportFrontmatter(content);

  assert.deepEqual(
    parsed.entries.map(({ key, valueKind, value }) => ({ key, valueKind, value })),
    [
      { key: 'plain', valueKind: 'plain', value: 'A plain value' },
      { key: 'single', valueKind: 'quoted', value: 'A quoted value' },
      { key: 'double', valueKind: 'quoted', value: 'Another quoted value' },
      { key: 'flow', valueKind: 'flow-sequence', value: ['one', 'two', 'three'] },
    ],
  );

  assertRejected('---\nname: [\n  one,\n  two\n]\n---\n', {
    code: 'ERR_IMPORT_FRONTMATTER_VALUE',
    line: 2,
    message: 'Invalid import frontmatter at line 2: expected a supported scalar value',
  });
});

test('parseImportFrontmatter captures canonical licenses and one-based inclusive entry lines', async (t) => {
  for (const value of ['MIT', 'Apache-2.0', 'Apache License 2.0']) {
    await t.test(value, () => {
      const content = `---\r\nname: Example\r\nlicense: ${value}\r\ndescription: Keep me\r\n---\r\nBody\r\n`;
      const parsed = parseImportFrontmatter(content);
      const entry = parsed.entries.find(({ key }) => key === 'license');

      assert.deepEqual(parsed.license, { status: 'present', value });
      assert.ok(entry);
      assert.equal(entry.valueKind, 'plain');
      assert.equal(entry.value, value);
      assert.equal(entry.startLine, 3);
      assert.equal(entry.endLine, 3);
      assert.equal(entry.startOffset, content.indexOf('license:'));
      assert.equal(entry.endOffset, content.indexOf('description:'));
      assert.equal(entry.raw, `license: ${value}\r\n`);
      assert.equal(content.slice(entry.startOffset, entry.endOffset), entry.raw);
    });
  }
});

test('parseImportFrontmatter accepts scalar-only tools flow and block sequences', async (t) => {
  const fixtures = [
    {
      name: 'single-line flow',
      source: 'tools: [Read, "Write", \'Search\']',
      kind: 'flow-sequence',
      endLine: 3,
    },
    {
      name: 'block',
      source: 'tools:\n  - Read\n  - "Write"\n  - \'Search\'',
      kind: 'block-sequence',
      endLine: 6,
    },
    {
      name: 'balanced multiline flow',
      source: 'tools: [\n  Read,\n  # comment punctuation is inert: ], {,\n\n  "Write",\n  \'Search\'\n]',
      kind: 'flow-sequence',
      endLine: 9,
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      const content = `---\nname: Example\n${fixture.source}\ndescription: Valid tools\n---\nBody\n`;
      const entry = parseImportFrontmatter(content).entries.find(({ key }) => key === 'tools');

      assert.ok(entry);
      assert.equal(entry.valueKind, fixture.kind);
      assert.deepEqual(entry.value, ['Read', 'Write', 'Search']);
      assert.equal(entry.startLine, 3);
      assert.equal(entry.endLine, fixture.endLine);
      assert.equal(content.slice(entry.startOffset, entry.endOffset), entry.raw);
    });
  }
});

test('parseImportFrontmatter enforces scalar-only tools items', async (t) => {
  const fixtures = [
    ['block mapping item', 'tools:\n  - name: Shell', 3],
    ['flow mapping item', 'tools: [Read, { name: Shell }]', 2],
    ['mapping-like flow item', 'tools: [name: Shell]', 2],
    ['nested flow sequence', 'tools: [Read, [Write]]', 2],
  ];

  for (const [name, source, line] of fixtures) {
    await t.test(String(name), () => {
      assertRejected(`---\n${source}\n---\n`, {
        code: 'ERR_IMPORT_FRONTMATTER_VALUE',
        line: Number(line),
        message: `Invalid import frontmatter at line ${line}: expected a supported scalar value`,
      });
    });
  }
});

test('parseImportFrontmatter rejects malformed structure with stable diagnostics', async (t) => {
  const fixtures = [
    {
      name: 'malformed opening delimiter',
      content: '--- \nname: Example\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
      line: 1,
      detail: "frontmatter delimiters must be exactly '---' at column zero",
    },
    {
      name: 'unterminated opener',
      content: '---\nname: Example\n',
      code: 'ERR_IMPORT_FRONTMATTER_UNTERMINATED',
      line: 1,
      detail: 'opening delimiter has no exact column-zero closing delimiter',
    },
    {
      name: 'malformed closing delimiter',
      content: '---\nname: Example\n ---\n',
      code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
      line: 3,
      detail: "frontmatter delimiters must be exactly '---' at column zero",
    },
    {
      name: 'tab in structure',
      content: '---\nname:\tExample\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_TAB',
      line: 2,
      detail: 'tabs are not allowed in frontmatter structure',
    },
    {
      name: 'nested mapping',
      content: '---\nname: Example\ndescription: Valid\n  owner: Team\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_INDENTATION',
      line: 4,
      detail: 'indented data is only allowed in a tools sequence',
    },
    {
      name: 'flow mapping',
      content: '---\nname: Example\nmetadata: { owner: Team }\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_VALUE',
      line: 3,
      detail: 'expected a supported scalar value',
    },
    {
      name: 'block scalar',
      content: '---\nname: Example\ndescription: |\n  text\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_VALUE',
      line: 3,
      detail: 'expected a supported scalar value',
    },
    {
      name: 'anchor',
      content: '---\nname: &identity Example\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_VALUE',
      line: 2,
      detail: 'expected a supported scalar value',
    },
    {
      name: 'alias',
      content: '---\nname: *identity\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_VALUE',
      line: 2,
      detail: 'expected a supported scalar value',
    },
    {
      name: 'tag',
      content: '---\nname: !text Example\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_VALUE',
      line: 2,
      detail: 'expected a supported scalar value',
    },
    {
      name: 'directive',
      content: '---\n%YAML 1.2\nname: Example\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
      line: 2,
      detail: "expected an unquoted ASCII key immediately followed by ':'",
    },
    {
      name: 'merge key',
      content: '---\nname: Example\n<<: *defaults\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
      line: 3,
      detail: "expected an unquoted ASCII key immediately followed by ':'",
    },
    {
      name: 'explicit key',
      content: '---\n? license\n: MIT\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
      line: 2,
      detail: "expected an unquoted ASCII key immediately followed by ':'",
    },
    {
      name: 'duplicate key',
      content: '---\nname: Example\nname: Duplicate\n---\n',
      code: 'ERR_IMPORT_FRONTMATTER_DUPLICATE_KEY',
      line: 3,
      detail: "duplicate top-level key 'name'",
    },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, () => {
      assertRejected(fixture.content, {
        code: fixture.code,
        line: fixture.line,
        message: `Invalid import frontmatter at line ${fixture.line}: ${fixture.detail}`,
      });
    });
  }
});

test('parseImportFrontmatter rejects delimiter-shaped opening markers instead of falling open to absence', async (t) => {
  // Finding 1: an opening line that begins with `---` but is not exactly `---`
  // (e.g. `--- # metadata`) must reject as a malformed delimiter, never fall
  // through to `{ present: false }`. Both parse and strip must throw; strip must
  // not silently return the input unchanged.
  const fixtures = [
    ['trailing comment', '--- # metadata\nname: Example\n---\nBody\n'],
    ['trailing content', '---x\nname: Example\n---\nBody\n'],
    ['trailing space', '--- \nname: Example\n---\nBody\n'],
    ['leading space', ' ---\nname: Example\n---\nBody\n'],
    ['extra hyphens', '----\nname: Example\n---\nBody\n'],
  ];
  const expected = {
    code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
    line: 1,
    message: "Invalid import frontmatter at line 1: frontmatter delimiters must be exactly '---' at column zero",
  };

  for (const [name, content] of fixtures) {
    await t.test(name, () => {
      for (const operation of [
        () => parseImportFrontmatter(content),
        () => stripImportFrontmatter(content, ['license']),
      ]) {
        assert.throws(operation, (error) => {
          assert.ok(error instanceof ImportFrontmatterError);
          assert.equal(error.code, expected.code);
          assert.equal(error.line, expected.line);
          assert.equal(error.message, expected.message);
          return true;
        });
      }
    });
  }
});

test('parseImportFrontmatter rejects delimiter-shaped closing markers with the stable delimiter code', async (t) => {
  // Finding 2: a closing line that begins with `---` but is not exactly `---`
  // (e.g. `--- # metadata`) previously fell through to be parsed as an entry and
  // surfaced ERR_IMPORT_FRONTMATTER_ENTRY. It must instead reject with the same
  // stable ERR_IMPORT_FRONTMATTER_DELIMITER used for whitespace variants, at its
  // own 1-based line. A trailing canonical closer is included so the pre-fix
  // parser reached the entry scan rather than the unterminated diagnostic.
  const fixtures = [
    ['trailing comment', '---\nname: Example\n--- # metadata\n---\nBody\n', 3],
    ['trailing content', '---\nname: Example\n---x\n---\nBody\n', 3],
    ['trailing space', '---\nname: Example\n--- \n---\nBody\n', 3],
    ['leading space', '---\nname: Example\n ---\n---\nBody\n', 3],
    ['extra hyphens', '---\nname: Example\n----\n---\nBody\n', 3],
  ];

  for (const [name, content, line] of fixtures) {
    await t.test(String(name), () => {
      const expected = {
        code: 'ERR_IMPORT_FRONTMATTER_DELIMITER',
        line: Number(line),
        message: `Invalid import frontmatter at line ${line}: frontmatter delimiters must be exactly '---' at column zero`,
      };
      for (const operation of [
        () => parseImportFrontmatter(content),
        () => stripImportFrontmatter(content, ['license']),
      ]) {
        assert.throws(operation, (error) => {
          assert.ok(error instanceof ImportFrontmatterError);
          assert.equal(error.code, expected.code);
          assert.equal(error.line, expected.line);
          assert.equal(error.message, expected.message);
          return true;
        });
      }
    });
  }
});

test('parseImportFrontmatter treats delimiter-shaped lines after the closing delimiter as body', () => {
  // Delimiter-shaped detection applies only to the opener line and the
  // pre-closer scan. Once the canonical `---` closer terminates the frontmatter,
  // lines that begin with `---` are ordinary body content and never reject.
  const content = [
    '---',
    'name: Example',
    'license: MIT',
    '---',
    '--- # not frontmatter',
    '----',
    'Body after the closing delimiter',
    '',
  ].join('\n');
  const parsed = parseImportFrontmatter(content);

  assert.equal(parsed.present, true);
  assert.deepEqual(parsed.license, { status: 'present', value: 'MIT' });
  assert.deepEqual(parsed.entries.map(({ key }) => key), ['name', 'license']);
  assert.equal(parsed.frontmatter?.endLine, 4);

  const stripped = stripImportFrontmatter(content, ['license']);
  assert.equal(stripped.includes('--- # not frontmatter'), true);
  assert.equal(stripped.includes('----'), true);
  assert.equal(stripped.includes('license: MIT'), false);
});

test('parseImportFrontmatter still classifies non-delimiter openers as absence', async (t) => {
  // Absence is only a line-1 that does not begin with `---` at all. Lines with
  // fewer than three leading hyphens (or a hyphen list item) remain body.
  const fixtures = [
    ['comment first line', '# Body only\n\nbody\n'],
    ['two hyphens then content', '-- almost a delimiter\nbody\n'],
    ['single hyphen list item', '- item\nbody\n'],
  ];

  for (const [name, content] of fixtures) {
    await t.test(String(name), () => {
      assert.deepEqual(parseImportFrontmatter(content), {
        present: false,
        frontmatter: null,
        entries: [],
        license: { status: 'absent' },
      });
      assert.equal(stripImportFrontmatter(content, ['license']), content);
    });
  }
});

test('parseImportFrontmatter rejects mixed-indentation license candidates and semantic duplicates', async (t) => {
  const indentedCandidates = [
    ' license: MIT',
    '  license: MIT',
    '  "license": MIT',
    '  license : MIT',
  ];
  for (const candidate of indentedCandidates) {
    await t.test(candidate, () => {
      assertRejected(`---\nname: Example\ndescription: Valid\n${candidate}\n---\n`, {
        code: 'ERR_IMPORT_FRONTMATTER_INDENTATION',
        line: 4,
        message: 'Invalid import frontmatter at line 4: indented data is only allowed in a tools sequence',
      });
    });
  }

  const semanticDuplicates = [
    {
      name: 'canonical duplicate',
      candidate: 'license: Apache-2.0',
      code: 'ERR_IMPORT_FRONTMATTER_DUPLICATE_KEY',
      detail: "duplicate top-level key 'license'",
    },
    {
      name: 'quoted semantic duplicate',
      candidate: '"license": Apache-2.0',
      code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
      detail: "expected an unquoted ASCII key immediately followed by ':'",
    },
    {
      name: 'spaced semantic duplicate',
      candidate: 'license : Apache-2.0',
      code: 'ERR_IMPORT_FRONTMATTER_ENTRY',
      detail: "expected an unquoted ASCII key immediately followed by ':'",
    },
  ];
  for (const fixture of semanticDuplicates) {
    await t.test(fixture.name, () => {
      assertRejected(`---\nname: Example\ndescription: Valid\nlicense: MIT\n${fixture.candidate}\n---\n`, {
        code: fixture.code,
        line: 5,
        message: `Invalid import frontmatter at line 5: ${fixture.detail}`,
      });
    });
  }

  assertRejected('---\nname: Example\nlicense: "MIT"\n---\n', {
    code: 'ERR_IMPORT_FRONTMATTER_LICENSE',
    line: 3,
    message: "Invalid import frontmatter at line 3: license must use exactly 'license: VALUE' with a nonempty ASCII plain scalar",
  });
});

test('stripImportFrontmatter removes only the requested license span', () => {
  const content = [
    '---',
    '# keep this comment',
    'name: Example',
    'license: MIT',
    'description: Keep this value',
    '---',
    'Body',
    '',
  ].join('\n');
  const expected = [
    '---',
    '# keep this comment',
    'name: Example',
    'description: Keep this value',
    '---',
    'Body',
    '',
  ].join('\n');

  assert.equal(stripImportFrontmatter(content, ['license']), expected);
  assert.equal(stripImportFrontmatter(content, ['missing']), content);
});

test('stripImportFrontmatter removes an entire multiline tools block', () => {
  const content = [
    '---',
    'name: Example',
    '# before tools',
    'tools:',
    '  - Read',
    '  - "Write"',
    '# after tools',
    'description: Keep this value',
    '---',
    'Body',
    '',
  ].join('\n');
  const expected = [
    '---',
    'name: Example',
    '# before tools',
    '# after tools',
    'description: Keep this value',
    '---',
    'Body',
    '',
  ].join('\n');

  assert.equal(stripImportFrontmatter(content, ['tools']), expected);
});

test('stripImportFrontmatter preserves LF and CRLF exactly without mutating inputs', async (t) => {
  for (const separator of ['\n', '\r\n']) {
    await t.test(JSON.stringify(separator), () => {
      const content = [
        '---',
        'name: Example',
        'tools: [',
        '  Read,',
        '  Write',
        ']',
        'license: Apache-2.0',
        'description: Keep',
        '---',
        'Body',
        '',
      ].join(separator);
      const expected = [
        '---',
        'name: Example',
        'description: Keep',
        '---',
        'Body',
        '',
      ].join(separator);
      const keys = Object.freeze(['tools', 'license']);
      const before = [...keys];

      assert.equal(stripImportFrontmatter(content, keys), expected);
      assert.deepEqual(keys, before);
      assert.equal(parseImportFrontmatter(content).frontmatter?.raw.includes(separator), true);
    });
  }
});
