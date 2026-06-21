import * as assert from 'assert';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { serializeWorkspace } from '../catalog/serialize';
import type { MetaBlock, MetaWorkspace } from '../catalog/serialize/types';
import { importCatalog } from '../catalog/serialize/import';
import { deepEqual } from '../catalog/serialize/normalize';

/** import → serialize → parse, for semantic round-trip assertions. */
function roundTrip(yamlText: string): CatalogEntry {
    const spec = importCatalog(yamlText);
    const ws: MetaWorkspace = { getTopBlocks: () => (spec ? [spec as unknown as MetaBlock] : []) };
    return yaml.load(serializeWorkspace(ws)) as CatalogEntry;
}

function args0(yamlText: string): Array<Record<string, unknown>> {
    return roundTrip(yamlText).implementations[0].blocks[0].blockly.args0 as never;
}

/**
 * Covers all four input types — including `input_end_row` (modeled as a proper
 * input, not routed through `field_generic`) — and the verbatim `align`
 * attribute, which inputs would otherwise drop (they gained a `rest` bag to match
 * fields). `%N` order is arbitrary; only round-trip identity is asserted.
 */
const ALL_INPUTS = `
id: input_coverage
category: Test
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: every_input
          message0: "every input"
          args0:
            - type: input_value
              name: VAL
              check: ["Number", "int"]
              align: RIGHT
            - type: input_statement
              name: STMT
              check: Action
            - type: input_dummy
              name: DUM
              align: CENTRE
            - type: input_end_row
              align: RIGHT
`;

suite('input coverage — round-trip identity for every input type', () => {
    test('all four input types round-trip semantically (incl. verbatim align)', () => {
        const original = yaml.load(ALL_INPUTS);
        const result = roundTrip(ALL_INPUTS);
        assert.ok(deepEqual(original, result), 'all-inputs block round-trip is semantically identical');
    });

    test('input alignment survives the round-trip (was previously dropped)', () => {
        const by = new Map(args0(ALL_INPUTS).map(a => [a.name ?? a.type, a]));
        assert.strictEqual(by.get('VAL')!.align, 'RIGHT');
        assert.strictEqual(by.get('DUM')!.align, 'CENTRE');
    });

    test('input_end_row is modeled as an input (not field_generic)', () => {
        const endRow = args0(ALL_INPUTS).find(a => a.align === 'RIGHT' && !('name' in a));
        assert.ok(endRow, 'end-row arg present');
        assert.strictEqual(endRow!.type, 'input_end_row');
    });

    test('a plain input keeps no spurious extra keys', () => {
        const plain = `
id: x
category: C
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0: "do %1"
          args0:
            - type: input_value
              name: A
`;
        const arg = args0(plain)[0];
        assert.deepStrictEqual(arg, { type: 'input_value', name: 'A' });
    });
});
