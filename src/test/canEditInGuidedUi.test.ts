import * as assert from 'assert';
import { canEditInGuidedUi } from '../catalog/canEditInGuidedUi';

const SINGLE_VALID = `
id: arduino-demo
category: "I/O::Digital"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: demo_write
          message0: "write pin %1"
          args0:
            - type: input_value
              name: PIN
          previousStatement: null
          nextStatement: null
        codegen:
          body:
            - "digitalWrite({{PIN}}, HIGH);"
          inputDefaults:
            PIN: "13"
`;

suite('canEditInGuidedUi', () => {
    test('accepts a single valid catalog document', () => {
        assert.deepStrictEqual(canEditInGuidedUi(SINGLE_VALID), { ok: true });
    });

    test('accepts an empty file (new catalog)', () => {
        assert.strictEqual(canEditInGuidedUi('').ok, true);
    });

    test('rejects multi-document YAML', () => {
        const multi = `${SINGLE_VALID}\n---\n${SINGLE_VALID}`;
        const r = canEditInGuidedUi(multi);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'multi-document');
    });

    test('rejects unparseable YAML', () => {
        const r = canEditInGuidedUi('id: [unterminated');
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'parse-error');
    });

    test('rejects a block using an imperative generator', () => {
        const withGen = SINGLE_VALID.replace(
            '        codegen:',
            '        generator: MyCustomGenerator\n        codegen:',
        );
        const r = canEditInGuidedUi(withGen);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'uses-generator');
    });

    test('rejects a block using a mutator', () => {
        const withMutator = SINGLE_VALID.replace(
            '          type: demo_write',
            '          type: demo_write\n          mutator: demo_mutator',
        );
        const r = canEditInGuidedUi(withMutator);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'uses-mutator');
    });

    test('rejects a schema-invalid catalog (missing required implementations)', () => {
        const r = canEditInGuidedUi('id: arduino-demo\ncategory: "I/O"\n');
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'schema-invalid');
    });
});
