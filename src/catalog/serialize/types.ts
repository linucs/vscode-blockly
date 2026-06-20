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
}

export interface MetaWorkspace {
    getTopBlocks(ordered: boolean): MetaBlock[];
}

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
