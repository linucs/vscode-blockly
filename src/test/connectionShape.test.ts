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

function blocksByType(entry: CatalogEntry): Map<string, Record<string, unknown>> {
    return new Map(entry.implementations[0].blocks.map(b => [String(b.blockly.type), b.blockly as Record<string, unknown>]));
}

/**
 * M5 — the authored block's connection **shape** (value/statement/hat/standalone),
 * its per-connection `check` lists, `style`, `extensions`, and value/statement input
 * `check` are now derived from editable fields/slots (not preserved verbatim in
 * extraState). Every form must still round-trip identically, including the two
 * surface distinctions deepEqual is sensitive to: `output: null` vs `output: Number`,
 * and a one-element `check: ["String"]` vs the scalar `check: String`.
 */
const SHAPES = `
id: shape_coverage
category: Test
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly: { type: v_any, message0: "a", output: null }
      - blockly: { type: v_num, message0: "n", output: Number }
      - blockly: { type: v_multi, message0: "m", output: ["Number", "String"] }
      - blockly: { type: s_both, message0: "s", previousStatement: null, nextStatement: null }
      - blockly: { type: hat, message0: "h", nextStatement: null }
      - blockly: { type: top_only, message0: "t", previousStatement: null }
      - blockly: { type: standalone, message0: "x" }
      - blockly:
          type: styled
          message0: "y"
          previousStatement: null
          nextStatement: null
          style: logic_blocks
          extensions: ["hat_event_style"]
      - blockly:
          type: inputs
          message0: "do %1 %2"
          args0:
            - { type: input_value, name: A, check: ["String"] }
            - { type: input_value, name: B, check: String }
`;

suite('connection shape + checks + style/extensions round-trip (M5)', () => {
    test('every shape/check/style/extensions form round-trips semantically', () => {
        const original = yaml.load(SHAPES);
        const result = roundTrip(SHAPES);
        assert.ok(deepEqual(original, result), 'shape-coverage catalog round-trip is semantically identical');
    });

    test('output: null and output: Number are preserved distinctly', () => {
        const by = blocksByType(roundTrip(SHAPES));
        assert.strictEqual(by.get('v_any')!.output, null);
        assert.strictEqual(by.get('v_num')!.output, 'Number');
        assert.ok(deepEqual(by.get('v_multi')!.output, ['Number', 'String']));
    });

    test('statement / hat / top-only / standalone keep exactly their connection keys', () => {
        const by = blocksByType(roundTrip(SHAPES));
        assert.deepStrictEqual(
            { p: 'previousStatement' in by.get('s_both')!, n: 'nextStatement' in by.get('s_both')! },
            { p: true, n: true },
        );
        assert.strictEqual('previousStatement' in by.get('hat')!, false);
        assert.strictEqual('nextStatement' in by.get('hat')!, true);
        assert.strictEqual('nextStatement' in by.get('top_only')!, false);
        const standalone = by.get('standalone')!;
        assert.ok(!('output' in standalone) && !('previousStatement' in standalone) && !('nextStatement' in standalone));
    });

    test('style and extensions round-trip', () => {
        const styled = blocksByType(roundTrip(SHAPES)).get('styled')!;
        assert.strictEqual(styled.style, 'logic_blocks');
        assert.ok(deepEqual(styled.extensions, ['hat_event_style']));
    });

    test('input check ["String"] stays a one-element array, scalar String stays scalar', () => {
        const args = blocksByType(roundTrip(SHAPES)).get('inputs')!.args0 as Array<Record<string, unknown>>;
        assert.ok(deepEqual(args[0].check, ['String']), 'A keeps one-element array form');
        assert.strictEqual(args[1].check, 'String', 'B keeps scalar form');
    });

    // The formal parser accepts `CENTER` (aliases CENTRE) but our ALIGN dropdown
    // only lists CENTRE — a non-canonical-but-valid value the corpus never used.
    // It must round-trip verbatim via the rest bag rather than being dropped.
    test('a parser-accepted but non-listed align value (CENTER) round-trips verbatim', () => {
        const yamlText = `
id: x
category: C
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0: "do %1"
          args0:
            - { type: input_value, name: A, align: CENTER }
`;
        const arg = (roundTrip(yamlText).implementations[0].blocks[0].blockly.args0 as Array<Record<string, unknown>>)[0];
        assert.deepStrictEqual(arg, { type: 'input_value', name: 'A', align: 'CENTER' });
    });
});
