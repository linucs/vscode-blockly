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
import { FIELD_DESCRIPTOR_BY_TYPE, scalarToField, type FieldDescriptor } from './fieldDescriptors';
import { i18nDisplay, isI18nMap } from './i18n';
import { CODEGEN_SECTION_SLOTS } from './types';

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

    // Connection shape: preserve each of output/previous/next independently
    // (presence + value) verbatim in extraState.
    for (const key of ['output', 'previousStatement', 'nextStatement'] as const) {
        if (key in blockly) {
            state[key] = blockly[key];
        }
    }
    if (codegen.inputDefaults && Object.keys(codegen.inputDefaults).length > 0) {
        state.inputDefaults = codegen.inputDefaults;
    }

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
    if (typeof codegen.precedence === 'string') {
        fields.PRECEDENCE = codegen.precedence;
    }
    if (blockly.tooltip !== undefined) {
        state.tooltip = blockly.tooltip;
    }
    if (blockly.colour !== undefined) {
        state.colour = blockly.colour;
    }
    if (typeof blockly.style === 'string') {
        state.style = blockly.style;
    }
    if (Array.isArray(blockly.extensions)) {
        state.extensions = blockly.extensions;
    }
    if (Array.isArray(def.tags)) {
        state.tags = def.tags;
    }

    // message{N} + args{N} → one message_row per rendered row.
    const rows: BlockSpec[] = [];
    for (let n = 0; `message${n}` in blockly; n++) {
        const args = (blockly[`args${n}`] as Array<Record<string, unknown>> | undefined) ?? [];
        // The editor edits the primary locale in the TEXT field; extraState keeps
        // the full i18n value (other locales) and the args-presence flag.
        const text = blockly[`message${n}`];
        const row = new BlockSpec('message_row', { TEXT: i18nDisplay(text as never) }, {
            ARGS: chain(args.map(specFromArg)),
        });
        row.extraState = { text, hasArgs: `args${n}` in blockly };
        rows.push(row);
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
        RAW_PROPS: chain(rawProps),
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
 * `statement` keep `name` + `check`; `dummy`/`end-row` keep an optional `name`.
 * Every other key (notably `align`) is stashed verbatim into `extraState.rest`
 * so it survives the round-trip even though the descriptor doesn't model it.
 */
function specFromInputArg(type: string, arg: Record<string, unknown>, name: string): BlockSpec {
    const fields: Record<string, string> = {};
    const claimed = new Set<string>(['type', 'name']);
    const state: Record<string, unknown> = {};
    if (type === 'input_value' || type === 'input_statement') {
        fields.NAME = name;
        claimed.add('check');
        if (arg.check !== undefined) {
            state.check = arg.check;
        }
    } else if (name) {
        fields.NAME = name;
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
    const spec = new BlockSpec(type, fields);
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
