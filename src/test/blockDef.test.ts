import * as assert from 'assert';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { serializeWorkspace } from '../catalog/serialize';
import type { MetaBlock, MetaWorkspace } from '../catalog/serialize/types';
import { importCatalog } from '../catalog/serialize/import';
import { deepEqual } from '../catalog/serialize/normalize';

/** Wrap an imported spec tree as the single-hat workspace the serializer reads. */
function workspaceOf(yamlText: string): MetaWorkspace {
    const spec = importCatalog(yamlText);
    return { getTopBlocks: () => (spec ? [spec as unknown as MetaBlock] : []) };
}

/** import → serialize → parse, for semantic assertions. */
function roundTrip(yamlText: string): CatalogEntry {
    return yaml.load(serializeWorkspace(workspaceOf(yamlText))) as CatalogEntry;
}

// A real value block + a real statement block, both with 14-locale i18n.
const PIN_MODE = `
id: arduino_digital_io
category: "Input / Output::Digital"
description:
  en: "Digital pins."
  it: "Pin digitali."
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: cpp_pin_mode
          message0:
            en: "pinMode pin %1 mode %2"
            it: "pinMode pin %1 modalità %2"
          args0:
            - type: input_value
              name: PIN
              check: ["Number", "int"]
            - type: field_dropdown
              name: MODE
              options:
                - ["INPUT", "INPUT"]
                - ["OUTPUT", "OUTPUT"]
          previousStatement: null
          nextStatement: null
          inputsInline: true
          tooltip:
            en: "Configure a digital pin."
            it: "Configura un pin digitale."
          helpUrl: "https://example.com/pinMode"
        codegen:
          body:
            - "pinMode({{PIN}}, {{MODE}});"
          inputDefaults:
            PIN: "13"
      - blockly:
          type: cpp_digital_read
          message0:
            en: "digitalRead pin %1"
            it: "digitalRead pin %1"
          args0:
            - type: input_value
              name: PIN
          output: Number
          inputsInline: true
        codegen:
          body:
            - "digitalRead({{PIN}})"
          precedence: ATOMIC
          inputDefaults:
            PIN: "2"
`;

suite('block definition serializer (Model A)', () => {
    test('round-trips a value + statement block semantically (i18n preserved)', () => {
        const original = yaml.load(PIN_MODE);
        const result = roundTrip(PIN_MODE);
        assert.ok(deepEqual(original, result), 'block round-trip is semantically identical');
    });

    test('preserves the verbatim i18n message template (no regeneration)', () => {
        const block = roundTrip(PIN_MODE).implementations[0].blocks[0].blockly;
        assert.deepStrictEqual(block.message0, { en: 'pinMode pin %1 mode %2', it: 'pinMode pin %1 modalità %2' });
        assert.strictEqual(block.args0.length, 2);
        assert.strictEqual(block.args0[0].type, 'input_value');
        assert.deepStrictEqual(block.args0[0].check, ['Number', 'int']);
        assert.strictEqual(block.args0[1].type, 'field_dropdown');
    });

    test('keeps output + precedence on the value block, statements on the other', () => {
        const blocks = roundTrip(PIN_MODE).implementations[0].blocks;
        assert.strictEqual(blocks[0].blockly.previousStatement, null);
        assert.strictEqual(blocks[0].blockly.nextStatement, null);
        assert.strictEqual(blocks[0].blockly.output, undefined);
        assert.strictEqual(blocks[1].blockly.output, 'Number');
        assert.strictEqual(blocks[1].codegen?.precedence, 'ATOMIC');
        assert.strictEqual(blocks[1].blockly.previousStatement, undefined);
    });

    test('carries inputDefaults verbatim (incl. plain strings)', () => {
        const blocks = roundTrip(PIN_MODE).implementations[0].blocks;
        assert.deepStrictEqual(blocks[0].codegen?.inputDefaults, { PIN: '13' });
    });

    test('a statement-only block keeps only nextStatement (no spurious previous)', () => {
        const oneSided = `
id: x
category: C
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0: "do %1"
          args0:
            - type: input_statement
              name: BODY
          nextStatement: null
`;
        const block = roundTrip(oneSided).implementations[0].blocks[0].blockly;
        assert.ok('nextStatement' in block, 'nextStatement kept');
        assert.ok(!('previousStatement' in block), 'no spurious previousStatement');
    });

    test('routes an unknown field type through field_generic verbatim', () => {
        const exotic = `
id: x
category: C
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0: "v %1"
          args0:
            - type: field_typed_param_input
              name: P
              variableTypes: ["int", "float"]
`;
        const arg = roundTrip(exotic).implementations[0].blocks[0].blockly.args0[0];
        assert.strictEqual(arg.type, 'field_typed_param_input');
        assert.deepStrictEqual(arg.variableTypes, ['int', 'float']);
    });

    test('preserves an unknown top-level blockly attribute via raw_blockly_prop', () => {
        const exotic = `
id: x
category: C
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0: "x"
          extraField: { nested: true }
`;
        const block = roundTrip(exotic).implementations[0].blocks[0].blockly as Record<string, unknown>;
        assert.deepStrictEqual(block.extraField, { nested: true });
    });
});
