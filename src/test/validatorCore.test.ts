import * as assert from 'assert';
import { validateCatalogResult, validateCatalogIssues, validateCatalogYaml } from '../catalog/validateCatalog';

const VALID = `
id: arduino-demo
category: "I/O::Digital"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: demo_read
          message0: "read pin %1"
          args0:
            - type: input_value
              name: PIN
          output: Number
        codegen:
          body:
            - "digitalRead({{PIN}})"
          precedence: ATOMIC
          inputDefaults:
            PIN: "2"
`;

// Value block missing precedence + an unknown placeholder + a stray inputDefault.
const INVALID = `
id: arduino-bad
category: "I/O::Digital"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: bad_read
          message0: "read pin %1"
          args0:
            - type: input_value
              name: PIN
          output: Number
        codegen:
          body:
            - "digitalRead({{MISSING}})"
          inputDefaults:
            NOPE: "2"
`;

suite('validateCatalogResult (structured core)', () => {
    test('valid catalog produces no issues and counts docs/blocks', () => {
        const r = validateCatalogResult(VALID);
        assert.deepStrictEqual(r.issues, []);
        assert.strictEqual(r.docCount, 1);
        assert.strictEqual(r.blockCount, 1);
        assert.strictEqual(r.parseError, undefined);
    });

    test('invalid catalog yields structured issues with path + severity', () => {
        const r = validateCatalogResult(INVALID);
        assert.ok(r.issues.length >= 3, JSON.stringify(r.issues, null, 2));
        for (const issue of r.issues) {
            assert.strictEqual(issue.severity, 'error');
            assert.strictEqual(typeof issue.path, 'string');
            assert.strictEqual(typeof issue.message, 'string');
        }
        // The output-without-precedence finding is scoped to the block.
        assert.ok(
            r.issues.some(i => i.path === 'Block "bad_read"' && i.message.includes('missing codegen.precedence')),
            JSON.stringify(r.issues, null, 2),
        );
    });

    test('YAML parse error is reported via parseError, not issues', () => {
        const r = validateCatalogResult('id: [unterminated');
        assert.notStrictEqual(r.parseError, undefined);
        assert.deepStrictEqual(r.issues, []);
    });

    test('validateCatalogIssues surfaces parse error as a single issue', () => {
        const issues = validateCatalogIssues('id: [unterminated');
        assert.strictEqual(issues.length, 1);
        assert.ok(issues[0].message.startsWith('YAML parse error:'), issues[0].message);
    });
});

suite('validateCatalogYaml (string formatter contract)', () => {
    test('valid catalog keeps the "Valid." prefix contract', () => {
        const s = validateCatalogYaml(VALID);
        assert.strictEqual(s, 'Valid. 1 document(s), 1 block(s).');
    });

    test('parse error renders the legacy raw form (no "Validation found" wrapper)', () => {
        const s = validateCatalogYaml('id: [unterminated');
        assert.ok(s.startsWith('YAML parse error:'), s);
    });

    test('issues render as the legacy flat bullet list, path-prefixed', () => {
        const s = validateCatalogYaml(INVALID);
        assert.ok(s.startsWith('Validation found '), s);
        assert.ok(s.includes('- Block "bad_read": has output but missing codegen.precedence'), s);
        assert.ok(s.includes('- Block "bad_read": placeholder {{MISSING}} not defined in args'), s);
        assert.ok(s.includes('- Block "bad_read": inputDefault "NOPE" does not correspond to an input_value'), s);
    });

    test('formatter output is reconstructable from the structured issues', () => {
        const r = validateCatalogResult(INVALID);
        const expected = `Validation found ${r.issues.length} issue(s):\n\n` +
            r.issues.map(i => `- ${i.path ? `${i.path}: ${i.message}` : i.message}`).join('\n');
        assert.strictEqual(validateCatalogYaml(INVALID), expected);
    });
});
