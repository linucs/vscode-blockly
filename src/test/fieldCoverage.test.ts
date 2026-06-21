import * as assert from 'assert';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { serializeWorkspace } from '../catalog/serialize';
import type { MetaBlock, MetaWorkspace } from '../catalog/serialize/types';
import { importCatalog } from '../catalog/serialize/import';
import { deepEqual } from '../catalog/serialize/normalize';
import { FIELD_DESCRIPTORS } from '../catalog/serialize/fieldDescriptors';

/** import → serialize → parse, for semantic round-trip assertions. */
function roundTrip(yamlText: string): CatalogEntry {
    const spec = importCatalog(yamlText);
    const ws: MetaWorkspace = { getTopBlocks: () => (spec ? [spec as unknown as MetaBlock] : []) };
    return yaml.load(serializeWorkspace(ws)) as CatalogEntry;
}

/** Read the single block's `args0` after a round-trip. */
function args0(yamlText: string): Array<Record<string, unknown>> {
    return roundTrip(yamlText).implementations[0].blocks[0].blockly.args0 as never;
}

/**
 * One block whose `args0` exercises **every** modeled field type with
 * representative attributes — including unmodeled optional attributes on the
 * plugin fields (`field_angle.clockwise`, `field_colour.columns`,
 * `field_multilineinput.spellcheck`, `field_grid_dropdown.columns`,
 * `field_bitmap` w/h, `field_dependent_dropdown.parentName`) to exercise the
 * verbatim `rest` bag. `%N` placeholders are arbitrary — only round-trip
 * identity of the args is asserted.
 */
const ALL_FIELDS = `
id: field_coverage
category: Test
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: every_field
          message0: "every field"
          args0:
            - type: field_input
              name: TXT
              text: "hello"
            - type: field_number
              name: NUM
              value: 5
              min: 0
              max: 10
              precision: 1
            - type: field_dropdown
              name: DD
              options:
                - ["A", "a"]
                - ["B", "b"]
            - type: field_checkbox
              name: CHK
              checked: true
            - type: field_label
              text: "static label"
            - type: field_label_serializable
              name: LBL
              text: "serializable label"
            - type: field_variable
              name: VAR
              variable: item
              variableTypes: ["int", "float"]
              defaultType: int
            - type: field_image
              src: "data:image/png;base64,AAAA"
              width: 16
              height: 16
              alt: "icon"
              flipRtl: true
            - type: field_angle
              name: ANG
              angle: 90
              clockwise: true
            - type: field_colour
              name: COL
              colour: "#ff0000"
              columns: 4
            - type: field_colour_hsv_sliders
              name: HSV
              colour: "#00ff00"
            - type: field_multilineinput
              name: ML
              text: "line1\\nline2"
              spellcheck: false
            - type: field_slider
              name: SLD
              value: 50
              min: 0
              max: 100
              precision: 5
            - type: field_dependent_dropdown
              name: DEP
              parentName: COL
              options: [["one", "1"]]
            - type: field_grid_dropdown
              name: GRID
              options:
                - ["x", "x"]
              columns: 3
            - type: field_bitmap
              name: BMP
              width: 3
              height: 2
              value:
                - [0, 1, 0]
                - [1, 0, 1]
            - type: field_combobox
              name: CB
              text: custom
              options:
                - ["P1", "p1"]
            - type: field_typed_param_input
              name: TP
              text: args
              defaultType: String
              options:
                - ["String", "String"]
                - ["int", "int"]
            - type: field_param_input
              name: PP
              text: args
            - type: field_code
              name: CODE
              text: "doStuff();"
`;

suite('field coverage (M4) — round-trip identity for every field type', () => {
    test('every modeled field type round-trips semantically (incl. verbatim rest)', () => {
        const original = yaml.load(ALL_FIELDS);
        const result = roundTrip(ALL_FIELDS);
        assert.ok(deepEqual(original, result), 'all-fields block round-trip is semantically identical');
    });

    test('the fixture covers every descriptor type', () => {
        const fixtureTypes = new Set(
            (yaml.load(ALL_FIELDS) as CatalogEntry)
                .implementations[0].blocks[0].blockly.args0!.map((a: { type: string }) => a.type),
        );
        for (const desc of FIELD_DESCRIPTORS) {
            assert.ok(fixtureTypes.has(desc.type), `fixture is missing ${desc.type}`);
        }
    });

    test('scalar kinds keep their JSON types (number / boolean, not string)', () => {
        const by = new Map(args0(ALL_FIELDS).map(a => [a.type as string, a]));
        assert.strictEqual(by.get('field_number')!.value, 5);
        assert.strictEqual(by.get('field_checkbox')!.checked, true);
        assert.strictEqual(by.get('field_image')!.flipRtl, true);
        assert.strictEqual(by.get('field_image')!.width, 16);
        assert.strictEqual(by.get('field_angle')!.angle, 90);
    });

    test('unmodeled attributes survive via the verbatim rest bag', () => {
        const by = new Map(args0(ALL_FIELDS).map(a => [a.type as string, a]));
        assert.strictEqual(by.get('field_angle')!.clockwise, true);
        assert.strictEqual(by.get('field_colour')!.columns, 4);
        assert.strictEqual(by.get('field_multilineinput')!.spellcheck, false);
        assert.strictEqual(by.get('field_grid_dropdown')!.columns, 3);
        assert.strictEqual(by.get('field_dependent_dropdown')!.parentName, 'COL');
    });

    test('structured data (options / bitmap grid / variableTypes) is preserved', () => {
        const by = new Map(args0(ALL_FIELDS).map(a => [a.type as string, a]));
        assert.deepStrictEqual(by.get('field_dropdown')!.options, [['A', 'a'], ['B', 'b']]);
        assert.deepStrictEqual(by.get('field_bitmap')!.value, [[0, 1, 0], [1, 0, 1]]);
        assert.deepStrictEqual(by.get('field_variable')!.variableTypes, ['int', 'float']);
    });

    test('a decorative field with no name stays nameless', () => {
        const label = args0(ALL_FIELDS).find(a => a.type === 'field_label')!;
        assert.ok(!('name' in label), 'field_label must not gain a name');
        assert.strictEqual(label.text, 'static label');
    });
});
