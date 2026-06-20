import * as assert from 'assert';
import { canEditInGuidedUi } from '../catalog/canEditInGuidedUi';

// A real, block-bearing catalog. In M2 the guided surface can't model block
// definitions, so these route to the raw-text editor.
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

// Metadata + implementation + dependencies, no block definitions — exactly what
// the M2 guided editor models.
const METADATA_ONLY = `
id: arduino-demo
category: "I/O::Digital"
version: "1.0.0"
author: Jane
implementations:
  - runtime: "arduino:cpp"
    targets:
      - uno
    dependencies:
      - type: library
        name: Servo
        minVersion: "1.2.0"
`;

suite('canEditInGuidedUi', () => {
    test('accepts a metadata-only catalog (no blocks)', () => {
        assert.deepStrictEqual(canEditInGuidedUi(METADATA_ONLY), { ok: true });
    });

    test('accepts an empty file (new catalog)', () => {
        assert.strictEqual(canEditInGuidedUi('').ok, true);
    });

    test('routes a block-bearing catalog to text (M2 cannot model blocks yet)', () => {
        const r = canEditInGuidedUi(SINGLE_VALID);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'has-block-definitions');
    });

    test('routes impl-level codegen to text', () => {
        const withImplCodegen = `
id: demo
category: "I/O"
implementations:
  - runtime: "arduino:cpp"
    codegen:
      imports:
        - "#include <Servo.h>"
`;
        const r = canEditInGuidedUi(withImplCodegen);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'has-block-definitions');
    });

    test('accepts a top-level docs map (modeled in M2)', () => {
        const withDocs = `${METADATA_ONLY}\ndocs:\n  api: "https://example.com"\n`;
        assert.deepStrictEqual(canEditInGuidedUi(withDocs), { ok: true });
    });

    test('routes an i18n-object description to text', () => {
        const withI18n = `
id: demo
category: "I/O"
description:
  en: "Demo"
  it: "Dimostrazione"
implementations:
  - runtime: "arduino:cpp"
`;
        const r = canEditInGuidedUi(withI18n);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'has-block-definitions');
    });

    test('rejects multi-document YAML', () => {
        const multi = `${METADATA_ONLY}\n---\n${METADATA_ONLY}`;
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
