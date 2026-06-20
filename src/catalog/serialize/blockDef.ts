import type { BlockCodegen, BlockDefinition, CodegenSections } from '../CatalogTypes';
import { readI18n } from './i18n';
import { extraState, field, mapChain, type MetaBlock } from './types';

/**
 * Serialize a `block_def` meta-block to a {@link BlockDefinition} (design "Model A":
 * messages are preserved **verbatim**, never regenerated — each `message_row` is one
 * rendered row, holding its i18n template + an ordered `ARGS` chain of one arg block
 * per `%N`). Pure, reads through {@link MetaBlock}, so `serialize(import(yaml))` is a
 * Node-testable semantic round-trip.
 *
 * The meta-block field/extraState contract (shared with `import.ts`):
 * - `block_def`: fields `TYPE`, `CONNECTIONS` (`value`|`statement`|`none`), `INLINE`
 *   (`unset`|`true`|`false`), `HELPURL`, `PRECEDENCE`; extraState `{ tooltip?, output?,
 *   extensions?, colour?, style?, tags? }`; inputs `MESSAGES`, `BODY`, `SETUP`,
 *   `IMPORTS`, `DECLARATIONS`, `HELPERS`, `RAW_PROPS`.
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

/** Serialize one arg block to its `args{N}[k]` entry. */
function buildArg(block: MetaBlock): Record<string, unknown> | null {
    const state = extraState(block);
    switch (block.type) {
        case 'input_value':
        case 'input_statement': {
            const entry: Record<string, unknown> = { type: block.type, name: field(block, 'NAME') };
            if (state.check !== undefined) {
                entry.check = state.check;
            }
            return entry;
        }
        case 'input_dummy': {
            const entry: Record<string, unknown> = { type: 'input_dummy' };
            const name = field(block, 'NAME');
            if (name) {
                entry.name = name;
            }
            return entry;
        }
        case 'field_dropdown':
            return { type: 'field_dropdown', name: field(block, 'NAME'), options: state.options };
        case 'field_input': {
            const entry: Record<string, unknown> = { type: 'field_input', name: field(block, 'NAME') };
            // `text` may be a meaningful empty string, so key on presence (null =
            // absent) and don't trim — preserve the authored default verbatim.
            const text = block.getFieldValue('TEXT');
            if (text !== null) {
                entry.text = text;
            }
            return entry;
        }
        case 'field_number': {
            const entry: Record<string, unknown> = { type: 'field_number', name: field(block, 'NAME') };
            for (const key of ['value', 'min', 'max', 'precision'] as const) {
                const raw = block.getFieldValue(key.toUpperCase());
                if (raw !== null && raw !== '') {
                    entry[key] = Number(raw);
                }
            }
            return entry;
        }
        case 'field_generic':
            // Catch-all: the whole arg entry was stored verbatim on import.
            return (state.entry as Record<string, unknown>) ?? null;
        default:
            return null;
    }
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
    for (const [slot, key] of [
        ['IMPORTS', 'imports'],
        ['DECLARATIONS', 'declarations'],
        ['SETUP', 'setup'],
        ['CLEANUP', 'cleanup'],
    ] as const) {
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
