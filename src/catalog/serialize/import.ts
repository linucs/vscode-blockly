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
import { isI18nMap } from './i18n';

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

export function specFromEntry(entry: CatalogEntry): BlockSpec {
    const fields: Record<string, string> = {
        ID: entry.id ?? '',
        CATEGORY: entry.category ?? '',
        VERSION: entry.version ?? '',
        AUTHOR: entry.author ?? '',
        COLOUR: entry.colour ?? '',
        // A plain-string description goes in the field; an i18n map goes in extraState.
        DESCRIPTION: typeof entry.description === 'string' ? entry.description : '',
    };
    const docs = Object.entries(entry.docs ?? {}).map(([name, url]) =>
        new BlockSpec('doc_link', { NAME: name, URL: url }),
    );
    const impls = (entry.implementations ?? []).map(specFromImplementation);
    const spec = new BlockSpec('catalog', fields, {
        DOCS: chain(docs),
        IMPLEMENTATIONS: chain(impls),
    });
    if (isI18nMap(entry.description)) {
        spec.extraState = { description: entry.description };
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

export function specFromBlockDefinition(def: BlockDefinition): BlockSpec {
    const blockly = def.blockly as Record<string, unknown>;
    const codegen = (def.codegen ?? {}) as BlockCodegen;

    const fields: Record<string, string> = { TYPE: String(blockly.type ?? '') };
    const state: Record<string, unknown> = {};

    // Connection shape: preserve each of output/previous/next independently
    // (presence + value), and derive a CONNECTIONS hint for the editor UI.
    for (const key of ['output', 'previousStatement', 'nextStatement'] as const) {
        if (key in blockly) {
            state[key] = blockly[key];
        }
    }
    fields.CONNECTIONS = 'output' in blockly ? 'value'
        : ('previousStatement' in blockly || 'nextStatement' in blockly) ? 'statement' : 'none';
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
        const row = new BlockSpec('message_row', {}, {
            ARGS: chain(args.map(specFromArg)),
        });
        // Preserve whether `args{n}` was present on disk: some blocks omit it,
        // others write an explicit empty `args{n}: []`.
        row.extraState = { text: blockly[`message${n}`], hasArgs: `args${n}` in blockly };
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
        case 'input_statement': {
            const spec = new BlockSpec(type, { NAME: name });
            if (arg.check !== undefined) {
                spec.extraState = { check: arg.check };
            }
            return spec;
        }
        case 'input_dummy':
            return new BlockSpec('input_dummy', name ? { NAME: name } : {});
        case 'field_dropdown': {
            const spec = new BlockSpec('field_dropdown', { NAME: name });
            spec.extraState = { options: arg.options };
            return spec;
        }
        case 'field_input': {
            const fields: Record<string, string> = { NAME: name };
            if (typeof arg.text === 'string') {
                fields.TEXT = arg.text;
            }
            return new BlockSpec('field_input', fields);
        }
        case 'field_number': {
            const fields: Record<string, string> = { NAME: name };
            for (const key of ['value', 'min', 'max', 'precision'] as const) {
                if (arg[key] !== undefined) {
                    fields[key.toUpperCase()] = String(arg[key]);
                }
            }
            return new BlockSpec('field_number', fields);
        }
        default: {
            // Catch-all: carry the whole arg entry verbatim.
            const spec = new BlockSpec('field_generic');
            spec.extraState = { entry: arg };
            return spec;
        }
    }
}

/** Build the shared codegen-section slots (imports/declarations/setup/cleanup/helpers) for a spec. */
function sectionInputs(sections: CodegenSections | undefined): Record<string, BlockSpec | null> {
    const out: Record<string, BlockSpec | null> = {};
    if (!sections) {
        return out;
    }
    for (const [key, slot] of [
        ['imports', 'IMPORTS'],
        ['declarations', 'DECLARATIONS'],
        ['setup', 'SETUP'],
        ['cleanup', 'CLEANUP'],
    ] as const) {
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
