import * as assert from 'assert';
import { canEditInGuidedUi } from '../catalog/canEditInGuidedUi';

// A real, block-bearing catalog. M3 models block definitions, so this is guided-
// editable; only generator/mutator variants route to the raw-text editor.
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

    test('accepts a block-bearing catalog (M3 models block definitions)', () => {
        assert.deepStrictEqual(canEditInGuidedUi(SINGLE_VALID), { ok: true });
    });

    test('accepts impl-level codegen (M3 models it)', () => {
        const withImplCodegen = `
id: demo
category: "I/O"
implementations:
  - runtime: "arduino:cpp"
    codegen:
      imports:
        - "#include <Servo.h>"
    blocks:
      - blockly:
          type: demo_x
          message0: "x"
`;
        assert.deepStrictEqual(canEditInGuidedUi(withImplCodegen), { ok: true });
    });

    test('accepts a top-level docs map (modeled in M2)', () => {
        const withDocs = `${METADATA_ONLY}\ndocs:\n  api: "https://example.com"\n`;
        assert.deepStrictEqual(canEditInGuidedUi(withDocs), { ok: true });
    });

    test('accepts an i18n-object description (M3 models it)', () => {
        const withI18n = `
id: demo
category: "I/O"
description:
  en: "Demo"
  it: "Dimostrazione"
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: demo_x
          message0: "x"
`;
        assert.deepStrictEqual(canEditInGuidedUi(withI18n), { ok: true });
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

    test('opens a schema-invalid but parseable catalog (invalid values are not a gate)', () => {
        // Missing `implementations` is a schema error, but the file parses and has
        // no un-modelable construct, so it opens in blocks — the user keeps editing
        // and the missing data surfaces as a validation message, not a text fallback.
        assert.deepStrictEqual(canEditInGuidedUi('id: arduino-demo\ncategory: "I/O"\n'), { ok: true });
    });

    test('opens a catalog with an uppercase FQBN target (schema relaxed)', () => {
        const withFqbn = SINGLE_VALID.replace(
            '    runtime: "arduino:cpp"',
            '    runtime: "arduino:cpp"\n    targets: ["arduino:samd:mkr1000USB"]',
        );
        assert.deepStrictEqual(canEditInGuidedUi(withFqbn), { ok: true });
    });
});
