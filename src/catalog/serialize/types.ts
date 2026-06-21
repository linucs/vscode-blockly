/**
 * Narrow, Blockly-free view of the meta-workspace the serializer reads. Keeping
 * the serializer to this interface (instead of `Blockly.Block`/`WorkspaceSvg`)
 * lets the round-trip tests run under Node with plain fake blocks, and keeps the
 * `yamlOutput/*` modules free of any top-level `blockly` import. A real
 * `Blockly.WorkspaceSvg`/`Block` satisfies these structurally.
 */
export interface MetaBlock {
    readonly type: string;
    getFieldValue(name: string): string | null;
    getInputTargetBlock(name: string): MetaBlock | null;
    getNextBlock(): MetaBlock | null;
    /**
     * Structured (non-string) leaf data a block carries that does not fit a
     * Blockly field: i18n locale maps (message/tooltip/description text), dropdown
     * option lists, value-input `check` lists. A {@link BlockSpec} returns its
     * `extraState`; a live `Blockly.Block` exposes the same via `saveExtraState`.
     * Read it through {@link extraState}, which bridges both.
     */
    getExtraState?(): Record<string, unknown> | null;
    /** Live Blockly blocks expose structured state here; bridged by {@link extraState}. */
    saveExtraState?(): Record<string, unknown> | null;
}

export interface MetaWorkspace {
    getTopBlocks(ordered: boolean): MetaBlock[];
}

/**
 * Codegen sections that round-trip as `code_line` chains, paired as
 * `[catalog key, meta-block slot name]`. Single source of truth for both
 * directions: serialize ({@link ./blockDef.assignSections}) and import
 * ({@link ./import.sectionInputs}). `helpers` is handled separately (a
 * name→body map, not a line chain) and `body` is block-only, so neither is here.
 */
export const CODEGEN_SECTION_SLOTS = [
    ['imports', 'IMPORTS'],
    ['declarations', 'DECLARATIONS'],
    ['setup', 'SETUP'],
    ['cleanup', 'CLEANUP'],
] as const;

/**
 * Input-alignment values the guided editor's ALIGN dropdown represents — the
 * canonical Blockly set. The formal parser (`Block.jsonInit`) uppercases `align`
 * and looks it up in `{LEFT, RIGHT, CENTRE, CENTER}` (CENTER aliases CENTRE),
 * warning "Illegal align value" on anything else. Only these canonical spellings
 * are claimed into the field; any other parser-accepted value (e.g. `CENTER`)
 * round-trips verbatim through the `rest` bag instead of being dropped by the
 * closed set. Single source shared by the importer and the webview meta-block.
 */
export const INPUT_ALIGN_VALUES = ['LEFT', 'RIGHT', 'CENTRE'] as const;

/** Walk a statement-input chain (head + `getNextBlock()` links), mapping each. */
export function mapChain<T>(head: MetaBlock | null, fn: (b: MetaBlock) => T | null): T[] {
    const out: T[] = [];
    for (let b: MetaBlock | null = head; b; b = b.getNextBlock()) {
        const v = fn(b);
        if (v !== null) {
            out.push(v);
        }
    }
    return out;
}

/** Trimmed field value, or `''` when absent. */
export function field(block: MetaBlock, name: string): string {
    return (block.getFieldValue(name) ?? '').trim();
}

/**
 * Read a block's structured leaf state, bridging the two carriers: a
 * {@link BlockSpec} (Node tests) exposes `getExtraState`, a live `Blockly.Block`
 * (webview) exposes `saveExtraState`. Returns `{}` when neither is present.
 */
export function extraState(block: MetaBlock): Record<string, unknown> {
    const state = block.getExtraState?.() ?? block.saveExtraState?.() ?? null;
    return state ?? {};
}

/** Parse a `k=v, k=v` text field into a string→string map (empty → `undefined`). */
export function parseMap(raw: string): Record<string, string> | undefined {
    const map: Record<string, string> = {};
    let any = false;
    for (const pair of raw.split(',')) {
        const eq = pair.indexOf('=');
        if (eq < 0) {
            continue;
        }
        const key = pair.slice(0, eq).trim();
        if (!key) {
            continue;
        }
        map[key] = pair.slice(eq + 1).trim();
        any = true;
    }
    return any ? map : undefined;
}
