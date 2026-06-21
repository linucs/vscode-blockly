import type { BlockCodegen, BlockDefinition, CodegenSections } from '../CatalogTypes';
import { FIELD_DESCRIPTOR_BY_TYPE, scalarToJson, type FieldDescriptor } from './fieldDescriptors';
import { readI18n } from './i18n';
import { CODEGEN_SECTION_SLOTS, extraState, field, mapChain, type MetaBlock } from './types';

/**
 * Serialize a `block_def` meta-block to a {@link BlockDefinition} (design "Model A":
 * messages are preserved **verbatim**, never regenerated — each `message_row` is one
 * rendered row, holding its i18n template + an ordered `ARGS` chain of one arg block
 * per `%N`). Pure, reads through {@link MetaBlock}, so `serialize(import(yaml))` is a
 * Node-testable semantic round-trip.
 *
 * The meta-block field/extraState contract (shared with `import.ts`):
 * - `block_def`: fields `TYPE`, `INLINE` (`unset`|`true`|`false`), `HELPURL`,
 *   `PRECEDENCE`; extraState `{ output?, previousStatement?, nextStatement?,
 *   tooltip?, colour?, style?, extensions?, tags?, inputDefaults? }` (the
 *   connection shape is preserved verbatim there, not via a field); inputs
 *   `MESSAGES`, `BODY`, `SETUP`, `IMPORTS`, `DECLARATIONS`, `CLEANUP`, `HELPERS`,
 *   `RAW_PROPS`.
 * - `message_row`: extraState `{ text }` (the verbatim message); input `ARGS`.
 * - arg blocks: see {@link buildArg}.
 */
export function buildBlockDefinition(block: MetaBlock): BlockDefinition {
    const state = extraState(block);
    const blockly: Record<string, unknown> = { type: field(block, 'TYPE') };

    // message{N} + args{N}: one message_row per rendered row, verbatim text.
    const rows = mapChain(block.getInputTargetBlock('MESSAGES'), row => row);
    rows.forEach((row, n) => {
        const rowState = extraState(row);
        const text = readI18n(rowState.text);
        blockly[`message${n}`] = text ?? '';
        const args = mapChain(row.getInputTargetBlock('ARGS'), buildArg);
        // Emit args{n} when it has entries or was explicitly present on disk.
        if (args.length > 0 || rowState.hasArgs === true) {
            blockly[`args${n}`] = args;
        }
    });

    // Connection shape: each of output / previous / next is independently present
    // and may carry a check value, so preserve them verbatim from extraState.
    for (const key of ['output', 'previousStatement', 'nextStatement'] as const) {
        if (key in state) {
            blockly[key] = state[key];
        }
    }

    const inline = field(block, 'INLINE');
    if (inline === 'true') {
        blockly.inputsInline = true;
    } else if (inline === 'false') {
        blockly.inputsInline = false;
    }

    const tooltip = readI18n(state.tooltip);
    if (tooltip !== undefined) {
        blockly.tooltip = tooltip;
    }
    const helpUrl = field(block, 'HELPURL');
    if (helpUrl) {
        blockly.helpUrl = helpUrl;
    }
    if (state.colour !== undefined) {
        blockly.colour = state.colour;
    }
    if (typeof state.style === 'string' && state.style) {
        blockly.style = state.style;
    }
    if (Array.isArray(state.extensions) && state.extensions.length > 0) {
        blockly.extensions = state.extensions;
    }
    // Catch-all: any unmodeled top-level blockly attribute, carried verbatim.
    for (const rawProp of mapChain(block.getInputTargetBlock('RAW_PROPS'), b => b)) {
        const key = field(rawProp, 'KEY');
        if (key) {
            blockly[key] = extraState(rawProp).value;
        }
    }

    const def: BlockDefinition = { blockly: blockly as BlockDefinition['blockly'] };

    const codegen = buildBlockCodegen(block, state);
    if (codegen) {
        def.codegen = codegen;
    }
    if (Array.isArray(state.tags) && state.tags.length > 0) {
        def.tags = state.tags as string[];
    }
    return def;
}

/** The four Blockly input arg types (sockets, not fields). */
const INPUT_TYPES = new Set(['input_value', 'input_statement', 'input_dummy', 'input_end_row']);

/** Serialize one arg block to its `args{N}[k]` entry. */
function buildArg(block: MetaBlock): Record<string, unknown> | null {
    const state = extraState(block);
    if (INPUT_TYPES.has(block.type)) {
        return buildInputArg(block, state);
    }
    switch (block.type) {
        case 'field_generic':
            // Catch-all: the whole arg entry was stored verbatim on import.
            return (state.entry as Record<string, unknown>) ?? null;
        default: {
            const desc = FIELD_DESCRIPTOR_BY_TYPE.get(block.type);
            return desc ? buildFieldArg(block, desc, state) : null;
        }
    }
}

/**
 * Serialize an input arg. `value`/`statement` carry a `name` and an optional
 * `check`; `dummy`/`end-row` carry only an optional `name`. Any other input
 * attribute (notably `align`) is preserved verbatim via the `rest` bag — the same
 * fidelity guarantee fields get, so an input round-trips identically even though
 * the guided UI doesn't model every attribute yet (alignment editing is M5).
 */
function buildInputArg(block: MetaBlock, state: Record<string, unknown>): Record<string, unknown> {
    const entry: Record<string, unknown> = { type: block.type };
    if (block.type === 'input_value' || block.type === 'input_statement') {
        entry.name = field(block, 'NAME');
        if (state.check !== undefined) {
            entry.check = state.check;
        }
    } else {
        const name = field(block, 'NAME');
        if (name) {
            entry.name = name;
        }
    }
    if (state.rest && typeof state.rest === 'object') {
        Object.assign(entry, state.rest);
    }
    return entry;
}

/**
 * Serialize a modeled field arg ({@link FieldDescriptor}-driven). Emits, in order,
 * `type`, optional `name`, each editable scalar, the structured leaf values from
 * `extraState`, and finally the verbatim `rest` bag of unmodeled attributes — so
 * the entry round-trips identically however lean the descriptor is. Scalars key on
 * **presence** (a `BlockSpec` returns `null` for a field never set on import, so an
 * absent attribute stays absent) and strings are not trimmed (an empty default is
 * meaningful).
 */
function buildFieldArg(
    block: MetaBlock,
    desc: FieldDescriptor,
    state: Record<string, unknown>,
): Record<string, unknown> {
    const entry: Record<string, unknown> = { type: block.type };
    if (desc.hasName) {
        const name = block.getFieldValue('NAME');
        if (name !== null) {
            entry.name = name;
        }
    }
    for (const scalar of desc.scalars) {
        const raw = block.getFieldValue(scalar.field);
        // Numbers drop the empty string (absent), matching the M3 `field_number`.
        if (raw === null || (scalar.kind === 'number' && raw === '')) {
            continue;
        }
        entry[scalar.json] = scalarToJson(raw, scalar.kind);
    }
    for (const key of desc.structured) {
        if (state[key] !== undefined) {
            entry[key] = state[key];
        }
    }
    if (state.rest && typeof state.rest === 'object') {
        Object.assign(entry, state.rest);
    }
    return entry;
}

/** Block-level codegen (`body`/`setup`/`imports`/`declarations`/`helpers`/`precedence`/`inputDefaults`). */
function buildBlockCodegen(block: MetaBlock, state: Record<string, unknown>): BlockCodegen | undefined {
    const codegen: BlockCodegen = {};

    const body = codeLines(block.getInputTargetBlock('BODY'));
    if (body.length > 0) {
        codegen.body = body;
    }
    assignSections(codegen, block);

    const precedence = field(block, 'PRECEDENCE');
    if (precedence) {
        codegen.precedence = precedence as BlockCodegen['precedence'];
    }

    // inputDefaults values may be empty strings or non-strings (schema: any), so
    // carry them verbatim from extraState rather than via per-arg string fields.
    if (state.inputDefaults !== undefined && Object.keys(state.inputDefaults as object).length > 0) {
        codegen.inputDefaults = state.inputDefaults as Record<string, unknown>;
    }

    return Object.keys(codegen).length > 0 ? codegen : undefined;
}

/** Shared {@link CodegenSections} (imports/declarations/setup/cleanup as code-line chains; helpers as a map). */
export function assignSections(target: CodegenSections, block: MetaBlock): void {
    for (const [key, slot] of CODEGEN_SECTION_SLOTS) {
        const lines = codeLines(block.getInputTargetBlock(slot));
        if (lines.length > 0) {
            target[key] = lines;
        }
    }
    const helpers = buildHelpers(block.getInputTargetBlock('HELPERS'));
    if (helpers) {
        target.helpers = helpers;
    }
}

/** A `code_line` chain → string[] (its `TEXT` fields). */
function codeLines(head: MetaBlock | null): string[] {
    return mapChain(head, b => (b.type === 'code_line' ? b.getFieldValue('TEXT') ?? '' : null));
}

/** A `helper` chain → `{ name: body }` map, or `undefined` when empty. */
function buildHelpers(head: MetaBlock | null): Record<string, string> | undefined {
    const pairs = mapChain(head, b => {
        if (b.type !== 'helper') {
            return null;
        }
        const name = field(b, 'NAME');
        return name ? ([name, b.getFieldValue('BODY') ?? ''] as [string, string]) : null;
    });
    return pairs.length > 0 ? Object.fromEntries(pairs) : undefined;
}
