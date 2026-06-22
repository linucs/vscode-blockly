import type { BlockCodegen, BlockDefinition, CodegenSections } from '../CatalogTypes';
import { checkChainToValue } from './connectionCheck';
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
 *   `PRECEDENCE`, `CONNECTIONS` (`NONE`|`LEFT`|`TOP`|`BOTTOM`|`BOTH` —
 *   picks which of output/prev/next are present); extraState `{ tooltip?, colour?,
 *   tags?, precedenceRaw?, inputDefaultsRaw? }` (the verbatim bags for out-of-enum
 *   precedence and non-string/empty-string input defaults); inputs `MESSAGES`,
 *   `BODY`, `SETUP`, `IMPORTS`,
 *   `DECLARATIONS`, `CLEANUP`, `HELPERS`, `EXTENSIONS`, `RAW_PROPS`, and the
 *   per-shape check slots `OUTPUTCHECK`/`TOPCHECK`/`BOTTOMCHECK` (connection_check chains).
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

    // Connection shape: the CONNECTIONS field picks which of output / previous /
    // next are present; each present connection's check comes from its
    // connection_check slot (empty chain → `null` = "any type"). Corpus shape
    // checks are only scalar/`null`, so the array-vs-scalar surface form isn't
    // tracked here (unlike input checks, which can be a 1-element array).
    const conn = field(block, 'CONNECTIONS') || 'BOTH';
    if (conn === 'LEFT') {
        blockly.output = checkChainToValue(block.getInputTargetBlock('OUTPUTCHECK'));
    } else {
        if (conn === 'TOP' || conn === 'BOTH') {
            blockly.previousStatement = checkChainToValue(block.getInputTargetBlock('TOPCHECK'));
        }
        if (conn === 'BOTTOM' || conn === 'BOTH') {
            blockly.nextStatement = checkChainToValue(block.getInputTargetBlock('BOTTOMCHECK'));
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
    // `style` (a theme block-style name) is preserved verbatim, not editable: it
    // overlaps confusingly with `colour` (Blockly treats them as mutually exclusive)
    // and only references the built-in language-block styles, which are meaningless
    // on a catalog block. Round-tripped like `colour`/`tags` so existing files keep it.
    if (state.style !== undefined) {
        blockly.style = state.style;
    }
    // extensions: one editable `extension` block per name in the EXTENSIONS slot.
    const extensions = mapChain(block.getInputTargetBlock('EXTENSIONS'), b =>
        b.type === 'extension' ? (field(b, 'VALUE') || null) : null,
    );
    if (extensions.length > 0) {
        blockly.extensions = extensions;
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
 * `check` (a connection_check chain; empty → omitted). All four types carry an
 * editable `align` field (omitted when blank). Any further unmodeled attribute is
 * preserved verbatim via the `rest` bag — the same fidelity guarantee fields get.
 * `state.checkArray` keeps a one-element `["String"]` from collapsing to `"String"`.
 */
function buildInputArg(block: MetaBlock, state: Record<string, unknown>): Record<string, unknown> {
    const entry: Record<string, unknown> = { type: block.type };
    if (block.type === 'input_value' || block.type === 'input_statement') {
        entry.name = field(block, 'NAME');
        const check = checkChainToValue(block.getInputTargetBlock('CHECK'), state.checkArray === true);
        if (check !== null) {
            entry.check = check;
        }
    } else {
        const name = field(block, 'NAME');
        if (name) {
            entry.name = name;
        }
    }
    const align = field(block, 'ALIGN');
    if (align) {
        entry.align = align;
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

    // precedence: the dropdown holds an in-enum value (or '' = omitted); an
    // out-of-enum value imported from a non-canonical file is preserved verbatim in
    // `precedenceRaw` (the field wins when the user picked one).
    const precedence = field(block, 'PRECEDENCE');
    if (precedence) {
        codegen.precedence = precedence as BlockCodegen['precedence'];
    } else if (state.precedenceRaw !== undefined) {
        codegen.precedence = state.precedenceRaw as BlockCodegen['precedence'];
    }

    // inputDefaults: non-empty-string defaults are co-located on each `input_value`
    // (so a rename carries them); non-string / empty-string defaults that a text
    // field can't faithfully hold are kept verbatim in `inputDefaultsRaw`.
    const inputDefaults = collectInputDefaults(block, state);
    if (Object.keys(inputDefaults).length > 0) {
        codegen.inputDefaults = inputDefaults;
    }

    return Object.keys(codegen).length > 0 ? codegen : undefined;
}

/**
 * Gather `codegen.inputDefaults` from the authored block: each `input_value`'s
 * `DEFAULT` field (non-empty string), merged over the verbatim `inputDefaultsRaw`
 * bag (non-string / empty-string defaults, and any default whose input was dropped).
 * The two are keyed by input name and never collide — the importer routes each
 * default to exactly one side.
 */
function collectInputDefaults(block: MetaBlock, state: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const row of mapChain(block.getInputTargetBlock('MESSAGES'), r => r)) {
        for (const arg of mapChain(row.getInputTargetBlock('ARGS'), a => a)) {
            if (arg.type !== 'input_value') {
                continue;
            }
            const name = field(arg, 'NAME');
            const def = arg.getFieldValue('DEFAULT');
            if (name && def) {
                out[name] = def;
            }
        }
    }
    if (state.inputDefaultsRaw && typeof state.inputDefaultsRaw === 'object') {
        Object.assign(out, state.inputDefaultsRaw as Record<string, unknown>);
    }
    return out;
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
