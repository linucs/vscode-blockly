import * as yaml from 'js-yaml';
import type {
    BlockCodegen,
    BlockDefinition,
    CatalogEntry,
    CodegenSections,
    Dependency,
    Implementation,
} from '../CatalogTypes';
import { BlockSpec, chain } from './blockSpec';
import { valueToCheckChain } from './connectionCheck';
import { FIELD_DESCRIPTOR_BY_TYPE, scalarToField, type FieldDescriptor } from './fieldDescriptors';
import { i18nDisplay, isI18nMap } from './i18n';
import { CODEGEN_SECTION_SLOTS, INPUT_ALIGN_VALUES, PRECEDENCE_VALUES } from './types';

/** Alignment spellings the ALIGN dropdown can hold; others fall through to `rest`. */
const KNOWN_ALIGN = new Set<string>(INPUT_ALIGN_VALUES);

/** Precedence values the PRECEDENCE dropdown can hold; others → `precedenceRaw`. */
const KNOWN_PRECEDENCE = new Set<string>(PRECEDENCE_VALUES);

/**
 * Import (the inverse of {@link ./index.serializeWorkspace}): parse catalog YAML
 * into a `catalog` {@link BlockSpec} tree the webview renders into real Blockly
 * blocks. Model A — messages/args are preserved **verbatim** as `message_row`
 * blocks (one per rendered row) holding the i18n template + an ordered `ARGS`
 * chain. `serialize(import(yaml))` is a semantic identity round-trip; unrecognized
 * fields/attributes are carried by `field_generic`/`raw_blockly_prop`.
 *
 * Returns `null` for an empty document (nothing to edit).
 */
export function importCatalog(yamlText: string): BlockSpec | null {
    const doc = yaml.load(yamlText);
    if (doc === null || doc === undefined || typeof doc !== 'object') {
        return null;
    }
    return specFromEntry(doc as CatalogEntry);
}

function specFromEntry(entry: CatalogEntry): BlockSpec {
    const fields: Record<string, string> = {
        ID: entry.id ?? '',
        CATEGORY: entry.category ?? '',
        VERSION: entry.version ?? '',
        AUTHOR: entry.author ?? '',
        COLOUR: entry.colour ?? '',
    };
    // The editor shows/edits the primary locale in the DESCRIPTION field; an i18n
    // map's other locales are preserved in extraState.
    fields.DESCRIPTION = i18nDisplay(entry.description);
    const docs = Object.entries(entry.docs ?? {}).map(([name, url]) =>
        new BlockSpec('doc_link', { NAME: name, URL: url }),
    );
    const impls = (entry.implementations ?? []).map(specFromImplementation);
    const spec = new BlockSpec('catalog', fields, {
        DOCS: chain(docs),
        IMPLEMENTATIONS: chain(impls),
    });
    // Carry the verbatim colour (field_colour canonicalises hex to lowercase, so
    // the editor preserves the authored case here) and an i18n-map description.
    const state: Record<string, unknown> = {};
    if (entry.colour) {
        state.colour = entry.colour;
    }
    if (isI18nMap(entry.description)) {
        state.description = entry.description;
    }
    if (Object.keys(state).length > 0) {
        spec.extraState = state;
    }
    return spec;
}

function specFromImplementation(impl: Implementation): BlockSpec {
    const targets = impl.targets ?? [];
    const fields: Record<string, string> = { RUNTIME: impl.runtime ?? '' };
    targets.forEach((t, i) => { fields[`TARGET${i}`] = t; });

    const deps = (impl.dependencies ?? []).map(specFromDependency);
    const inputs: Record<string, BlockSpec | null> = {
        DEPENDENCIES: chain(deps),
        BLOCKS: chain((impl.blocks ?? []).map(specFromBlockDefinition)),
        ...sectionInputs(impl.codegen),
    };
    const spec = new BlockSpec('implementation', fields, inputs);
    // Tell the renderer how many TARGET{i} rows to create before fields are set.
    spec.extraState = { targetCount: targets.length };
    return spec;
}

function specFromDependency(dep: Dependency): BlockSpec {
    switch (dep.type) {
        case 'library':
            return new BlockSpec('dependency_library', {
                NAME: dep.name ?? '',
                MINVERSION: dep.minVersion ?? '',
                URL: dep.url ?? '',
                REF: dep.ref ?? '',
            });
        case 'pip':
            return new BlockSpec('dependency_pip', {
                NAME: dep.name ?? '',
                MINVERSION: dep.minVersion ?? '',
            });
        case 'brick':
            return new BlockSpec('dependency_brick', {
                NAME: dep.name ?? '',
                VARIABLES: Object.entries(dep.variables ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
            });
    }
}

/** Top-level `blockly` keys the meta-model represents directly; the rest → `raw_blockly_prop`. */
const KNOWN_BLOCKLY_KEYS = new Set([
    'type', 'output', 'previousStatement', 'nextStatement', 'inputsInline',
    'tooltip', 'helpUrl', 'colour', 'style', 'extensions',
]);

function specFromBlockDefinition(def: BlockDefinition): BlockSpec {
    const blockly = def.blockly as Record<string, unknown>;
    const codegen = (def.codegen ?? {}) as BlockCodegen;

    const fields: Record<string, string> = { TYPE: String(blockly.type ?? '') };
    const state: Record<string, unknown> = {};
    const shapeInputs: Record<string, BlockSpec | null> = {};

    // Connection shape → CONNECTIONS field + per-shape connection_check slots.
    // `output` wins if (invalidly) combined with statement connections, matching
    // Blockly. Each check value becomes a connection_check chain in its slot.
    const hasOut = 'output' in blockly;
    const hasPrev = 'previousStatement' in blockly;
    const hasNext = 'nextStatement' in blockly;
    if (hasOut) {
        fields.CONNECTIONS = 'LEFT';
        shapeInputs.OUTPUTCHECK = chain(valueToCheckChain(blockly.output));
    } else if (hasPrev && hasNext) {
        fields.CONNECTIONS = 'BOTH';
        shapeInputs.TOPCHECK = chain(valueToCheckChain(blockly.previousStatement));
        shapeInputs.BOTTOMCHECK = chain(valueToCheckChain(blockly.nextStatement));
    } else if (hasPrev) {
        fields.CONNECTIONS = 'TOP';
        shapeInputs.TOPCHECK = chain(valueToCheckChain(blockly.previousStatement));
    } else if (hasNext) {
        fields.CONNECTIONS = 'BOTTOM';
        shapeInputs.BOTTOMCHECK = chain(valueToCheckChain(blockly.nextStatement));
    } else {
        fields.CONNECTIONS = 'NONE';
    }
    // The renderer rebuilds the dynamic check slots in loadExtraState (before
    // fields are set), so it needs the chosen shape there, not just in the field.
    state.connections = fields.CONNECTIONS;

    if (blockly.inputsInline === true) {
        fields.INLINE = 'true';
    } else if (blockly.inputsInline === false) {
        fields.INLINE = 'false';
    } else {
        fields.INLINE = 'unset';
    }

    if (typeof blockly.helpUrl === 'string') {
        fields.HELPURL = blockly.helpUrl;
    }
    // precedence → dropdown when in-enum; an out-of-enum or non-string value
    // (non-canonical file) is preserved verbatim and the dropdown stays empty.
    if (codegen.precedence !== undefined) {
        if (typeof codegen.precedence === 'string' && KNOWN_PRECEDENCE.has(codegen.precedence)) {
            fields.PRECEDENCE = codegen.precedence;
        } else {
            state.precedenceRaw = codegen.precedence;
        }
    }
    if (blockly.tooltip !== undefined) {
        state.tooltip = blockly.tooltip;
    }
    if (blockly.colour !== undefined) {
        state.colour = blockly.colour;
    }
    if (typeof blockly.style === 'string') {
        fields.STYLE = blockly.style;
    }
    if (Array.isArray(def.tags)) {
        state.tags = def.tags;
    }
    // extensions → one editable `extension` block per name in the EXTENSIONS slot.
    const extensionSpecs = (Array.isArray(blockly.extensions) ? blockly.extensions : [])
        .filter((e): e is string => typeof e === 'string')
        .map(e => new BlockSpec('extension', { VALUE: e }));

    // message{N} + args{N} → one message_row per rendered row. Index the
    // `input_value` specs by name so codegen.inputDefaults can be co-located.
    const rows: BlockSpec[] = [];
    const inputValueByName = new Map<string, BlockSpec>();
    for (let n = 0; `message${n}` in blockly; n++) {
        const args = (blockly[`args${n}`] as Array<Record<string, unknown>> | undefined) ?? [];
        const argSpecs = args.map(specFromArg);
        for (const a of argSpecs) {
            if (a.type === 'input_value' && a.fields.NAME) {
                inputValueByName.set(a.fields.NAME, a);
            }
        }
        // The editor edits the primary locale in the TEXT field; extraState keeps
        // the full i18n value (other locales) and the args-presence flag.
        const text = blockly[`message${n}`];
        const row = new BlockSpec('message_row', { TEXT: i18nDisplay(text as never) }, {
            ARGS: chain(argSpecs),
        });
        row.extraState = { text, hasArgs: `args${n}` in blockly };
        rows.push(row);
    }

    // inputDefaults: route a non-empty-string default to its `input_value`'s
    // DEFAULT field (so a rename carries it); keep non-string / empty-string
    // defaults — and any default whose input is missing — verbatim, so `0` (number)
    // never collapses to `"0"` and the validator can still flag stray keys.
    if (codegen.inputDefaults && typeof codegen.inputDefaults === 'object') {
        const raw: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(codegen.inputDefaults)) {
            const target = inputValueByName.get(name);
            if (target && typeof value === 'string' && value.length > 0) {
                target.fields.DEFAULT = value;
            } else {
                raw[name] = value;
            }
        }
        if (Object.keys(raw).length > 0) {
            state.inputDefaultsRaw = raw;
        }
    }

    // Unmodeled top-level attributes → raw_blockly_prop carriers.
    const rawProps: BlockSpec[] = [];
    for (const [key, value] of Object.entries(blockly)) {
        if (KNOWN_BLOCKLY_KEYS.has(key) || /^(message|args)\d+$/.test(key)) {
            continue;
        }
        const rp = new BlockSpec('raw_blockly_prop', { KEY: key });
        rp.extraState = { value };
        rawProps.push(rp);
    }

    const inputs: Record<string, BlockSpec | null> = {
        MESSAGES: chain(rows),
        BODY: chain(codeLineSpecs(codegen.body)),
        EXTENSIONS: chain(extensionSpecs),
        RAW_PROPS: chain(rawProps),
        ...shapeInputs,
        ...sectionInputs(codegen),
    };

    const spec = new BlockSpec('block_def', fields, inputs);
    spec.extraState = state;
    return spec;
}

/** One arg entry → its meta-block spec. Unmodeled field types → `field_generic` (verbatim). */
function specFromArg(arg: Record<string, unknown>): BlockSpec {
    const type = String(arg.type ?? '');
    const name = typeof arg.name === 'string' ? arg.name : '';

    switch (type) {
        case 'input_value':
        case 'input_statement':
        case 'input_dummy':
        case 'input_end_row':
            return specFromInputArg(type, arg, name);
        default: {
            const desc = FIELD_DESCRIPTOR_BY_TYPE.get(type);
            if (desc) {
                return specFromFieldArg(arg, desc);
            }
            // Catch-all: carry the whole arg entry verbatim.
            const spec = new BlockSpec('field_generic');
            spec.extraState = { entry: arg };
            return spec;
        }
    }
}

/**
 * Import an input arg (inverse of {@link ./blockDef.buildInputArg}). `value`/
 * `statement` keep `name` + a `check` (modeled as a connection_check chain in the
 * `CHECK` slot); all four types keep `align` as an editable field. `checkArray`
 * records whether the source `check` was a one-element array (`["String"]`), so it
 * doesn't collapse to the scalar `"String"`. Every other key is stashed verbatim
 * into `extraState.rest` so it survives the round-trip.
 */
function specFromInputArg(type: string, arg: Record<string, unknown>, name: string): BlockSpec {
    const fields: Record<string, string> = {};
    const inputs: Record<string, BlockSpec | null> = {};
    const claimed = new Set<string>(['type', 'name']);
    const state: Record<string, unknown> = {};
    if (type === 'input_value' || type === 'input_statement') {
        fields.NAME = name;
        claimed.add('check');
        if (arg.check !== undefined) {
            inputs.CHECK = chain(valueToCheckChain(arg.check));
            if (Array.isArray(arg.check)) {
                state.checkArray = true;
            }
        }
    } else if (name) {
        fields.NAME = name;
    }
    // Only the values the ALIGN dropdown can represent are claimed into the field;
    // any other parser-accepted spelling (e.g. the alias `CENTER`) round-trips
    // verbatim through `rest` rather than being silently dropped by the closed set.
    if (typeof arg.align === 'string' && KNOWN_ALIGN.has(arg.align)) {
        fields.ALIGN = arg.align;
        claimed.add('align');
    }
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(arg)) {
        if (!claimed.has(key)) {
            rest[key] = value;
        }
    }
    if (Object.keys(rest).length > 0) {
        state.rest = rest;
    }
    const spec = new BlockSpec(type, fields, inputs);
    if (Object.keys(state).length > 0) {
        spec.extraState = state;
    }
    return spec;
}

/**
 * Import a modeled field arg ({@link FieldDescriptor}-driven, inverse of
 * {@link ./blockDef.buildFieldArg}). Scalars become meta-block fields; structured
 * keys go to `extraState`; every other key is stashed verbatim into `extraState.rest`
 * so it survives the round-trip even though the descriptor doesn't model it.
 */
function specFromFieldArg(arg: Record<string, unknown>, desc: FieldDescriptor): BlockSpec {
    const fields: Record<string, string> = {};
    const claimed = new Set<string>(['type']);
    if (desc.hasName) {
        claimed.add('name');
        if (typeof arg.name === 'string') {
            fields.NAME = arg.name;
        }
    }
    for (const scalar of desc.scalars) {
        claimed.add(scalar.json);
        if (arg[scalar.json] !== undefined) {
            fields[scalar.field] = scalarToField(arg[scalar.json], scalar.kind);
        }
    }
    const state: Record<string, unknown> = {};
    for (const key of desc.structured) {
        claimed.add(key);
        if (arg[key] !== undefined) {
            state[key] = arg[key];
        }
    }
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(arg)) {
        if (!claimed.has(key)) {
            rest[key] = value;
        }
    }
    if (Object.keys(rest).length > 0) {
        state.rest = rest;
    }
    const spec = new BlockSpec(desc.type, fields);
    if (Object.keys(state).length > 0) {
        spec.extraState = state;
    }
    return spec;
}

/** Build the shared codegen-section slots (imports/declarations/setup/cleanup/helpers) for a spec. */
function sectionInputs(sections: CodegenSections | undefined): Record<string, BlockSpec | null> {
    const out: Record<string, BlockSpec | null> = {};
    if (!sections) {
        return out;
    }
    for (const [key, slot] of CODEGEN_SECTION_SLOTS) {
        const lines = sections[key];
        if (Array.isArray(lines) && lines.length > 0) {
            out[slot] = chain(codeLineSpecs(lines));
        }
    }
    const helpers = sections.helpers;
    if (helpers && Object.keys(helpers).length > 0) {
        out.HELPERS = chain(Object.entries(helpers).map(([name, body]) =>
            new BlockSpec('helper', { NAME: name, BODY: body }),
        ));
    }
    return out;
}

function codeLineSpecs(lines: string[] | undefined): BlockSpec[] {
    return (lines ?? []).map(line => new BlockSpec('code_line', { TEXT: line }));
}
