/**
 * The single source of truth for the field arg meta-blocks (catalog-editor M4).
 *
 * Each {@link FieldDescriptor} declares one Blockly field type the guided editor
 * models as a dedicated, editable meta-block. The same table drives all three
 * touchpoints, so there is exactly one implementation per concept (plan §3a):
 * - serialize ({@link ../blockDef.buildArg}): meta-block → `args{N}` JSON,
 * - import ({@link ../import.specFromArg}): JSON → `BlockSpec`,
 * - the live meta-block defs (`webview/catalog-editor/metaBlocks/args.ts`).
 *
 * A descriptor models only the **common/primary** attributes as editable
 * `scalars`; structured leaf data (option lists, bitmap grids, variable-type
 * lists) rides in `extraState` under its JSON key. Any attribute claimed by
 * neither `name`/`scalars`/`structured` is preserved verbatim via the `rest`
 * bag (see import/serialize) — so round-trip identity holds regardless of how
 * lean a descriptor is, the same philosophy as `block_def`'s `raw_blockly_prop`.
 *
 * Labels are English-hardcoded; editor i18n is deferred to M8 (plan §3-6).
 */

export type ScalarKind = 'string' | 'number' | 'bool';

/** One editable attribute: its `blockly` JSON key ↔ the meta-block field name. */
export interface ScalarAttr {
    /** Key in the `args{N}[k]` JSON object (e.g. `text`, `min`, `checked`). */
    json: string;
    /** Blockly field name on the meta-block (e.g. `TEXT`, `MIN`, `CHECKED`). */
    field: string;
    kind: ScalarKind;
    /** Display label shown before the field on the meta-block. */
    label: string;
}

export interface FieldDescriptor {
    /** The Blockly field type, e.g. `field_checkbox`. */
    type: string;
    /** Display label leading the meta-block, e.g. `checkbox`. */
    label: string;
    /** Whether this field carries a `name` (decorative fields like labels/images may not). */
    hasName: boolean;
    /** Editable scalar attributes. */
    scalars: ScalarAttr[];
    /** JSON keys whose (structured) values are carried verbatim via `extraState`. */
    structured: string[];
    /**
     * How the (single) structured key is *edited* in the meta-block, when editable:
     * - `pairs`  — `options` as inline `[label, value]` rows (dropdowns/combobox);
     * - `list`   — `variableTypes` as inline single-value rows;
     * - `bitmap` — `value` via an embedded themed bitmap grid.
     * Omitted → the structured value rides verbatim in `extraState` with a read-only
     * summary (the M4 posture). See `webview/catalog-editor/metaBlocks/args.ts` and
     * the serialize/import branches.
     */
    structuredEditor?: 'pairs' | 'list' | 'bitmap';
}

const NUM = (json: string, field: string, label: string): ScalarAttr => ({ json, field, kind: 'number', label });
const STR = (json: string, field: string, label: string): ScalarAttr => ({ json, field, kind: 'string', label });
const BOOL = (json: string, field: string, label: string): ScalarAttr => ({ json, field, kind: 'bool', label });

/** value/min/max/precision — shared by `field_number` and `field_slider`. */
const NUMERIC_RANGE: ScalarAttr[] = [
    NUM('value', 'VALUE', 'value'),
    NUM('min', 'MIN', 'min'),
    NUM('max', 'MAX', 'max'),
    NUM('precision', 'PRECISION', 'precision'),
];

export const FIELD_DESCRIPTORS: FieldDescriptor[] = [
    // ── Core Blockly fields ──────────────────────────────────────────────
    { type: 'field_input', label: 'text field', hasName: true, scalars: [STR('text', 'TEXT', 'default')], structured: [] },
    { type: 'field_number', label: 'number field', hasName: true, scalars: NUMERIC_RANGE, structured: [] },
    { type: 'field_dropdown', label: 'dropdown', hasName: true, scalars: [], structured: ['options'], structuredEditor: 'pairs' },
    { type: 'field_checkbox', label: 'checkbox', hasName: true, scalars: [BOOL('checked', 'CHECKED', 'checked')], structured: [] },
    { type: 'field_label', label: 'label', hasName: false, scalars: [STR('text', 'TEXT', 'text')], structured: [] },
    { type: 'field_label_serializable', label: 'label (serializable)', hasName: true, scalars: [STR('text', 'TEXT', 'text')], structured: [] },
    {
        type: 'field_variable', label: 'variable', hasName: true,
        scalars: [STR('variable', 'VARIABLE', 'variable'), STR('defaultType', 'DEFAULTTYPE', 'default type')],
        structured: ['variableTypes'], structuredEditor: 'list',
    },
    {
        type: 'field_image', label: 'image', hasName: false,
        scalars: [STR('src', 'SRC', 'src'), NUM('width', 'WIDTH', 'width'), NUM('height', 'HEIGHT', 'height'), STR('alt', 'ALT', 'alt'), BOOL('flipRtl', 'FLIPRTL', 'flip RTL')],
        structured: [],
    },
    // ── Plugin fields (@blockly/*) ───────────────────────────────────────
    { type: 'field_angle', label: 'angle', hasName: true, scalars: [NUM('angle', 'ANGLE', 'angle')], structured: [] },
    { type: 'field_colour', label: 'colour', hasName: true, scalars: [STR('colour', 'COLOUR', 'colour')], structured: [] },
    { type: 'field_colour_hsv_sliders', label: 'colour (HSV)', hasName: true, scalars: [STR('colour', 'COLOUR', 'colour')], structured: [] },
    { type: 'field_multilineinput', label: 'multiline', hasName: true, scalars: [STR('text', 'TEXT', 'default')], structured: [] },
    { type: 'field_slider', label: 'slider', hasName: true, scalars: NUMERIC_RANGE, structured: [] },
    { type: 'field_dependent_dropdown', label: 'dependent dropdown', hasName: true, scalars: [], structured: ['options'], structuredEditor: 'pairs' },
    { type: 'field_grid_dropdown', label: 'grid dropdown', hasName: true, scalars: [], structured: ['options'], structuredEditor: 'pairs' },
    // ── First-party custom fields (webview/custom-fields/*) ──────────────
    { type: 'field_bitmap', label: 'bitmap', hasName: true, scalars: [NUM('width', 'WIDTH', 'width'), NUM('height', 'HEIGHT', 'height')], structured: ['value'], structuredEditor: 'bitmap' },
    { type: 'field_combobox', label: 'combobox', hasName: true, scalars: [STR('text', 'TEXT', 'value')], structured: ['options'], structuredEditor: 'pairs' },
    {
        type: 'field_typed_param_input', label: 'typed param', hasName: true,
        scalars: [STR('text', 'TEXT', 'default'), STR('defaultType', 'DEFAULTTYPE', 'default type')],
        structured: ['options'], structuredEditor: 'pairs',
    },
    { type: 'field_param_input', label: 'param', hasName: true, scalars: [STR('text', 'TEXT', 'default')], structured: [] },
    { type: 'field_code', label: 'code', hasName: true, scalars: [STR('text', 'TEXT', 'code')], structured: [] },
];

export const FIELD_DESCRIPTOR_BY_TYPE: ReadonlyMap<string, FieldDescriptor> =
    new Map(FIELD_DESCRIPTORS.map(d => [d.type, d]));

/**
 * Whether a Blockly `options` array is editable as inline `[label, value]` rows:
 * every entry must be a 2-tuple of strings. Image-label options (label is an
 * `{src,width,height,alt}` object) and any odd shape fail this and are preserved
 * verbatim instead (round-trip safety; the block shows a read-only summary).
 */
export function isStringPairOptions(value: unknown): value is [string, string][] {
    return Array.isArray(value) && value.every(
        e => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && typeof e[1] === 'string',
    );
}

/** Coerce a meta-block field's string value to its JSON-typed scalar. */
export function scalarToJson(raw: string, kind: ScalarKind): string | number | boolean {
    switch (kind) {
        case 'number':
            return Number(raw);
        case 'bool':
            return raw === 'TRUE';
        case 'string':
            return raw;
    }
}

/** Coerce a JSON-typed scalar to the string a meta-block field stores. */
export function scalarToField(value: unknown, kind: ScalarKind): string {
    switch (kind) {
        case 'bool':
            return value ? 'TRUE' : 'FALSE';
        case 'number':
        case 'string':
            return String(value);
    }
}
