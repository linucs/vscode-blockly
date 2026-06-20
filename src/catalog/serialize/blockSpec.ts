import type { MetaBlock } from './types';

/**
 * A plain, Blockly-free description of a meta-block: its type, field values,
 * statement-input chains, and the next block in its own chain. It is the
 * importer's output (YAML → specs) and the webview renderer's input (specs →
 * real Blockly blocks).
 *
 * Crucially, a `BlockSpec` also *implements* {@link MetaBlock}, so the serializer
 * reads a spec tree with the exact same accessors it uses on a live Blockly
 * workspace. That makes `serialize(import(yaml))` a pure, Node-testable identity
 * round-trip — no headless Blockly, no mocks — while faithfully mirroring runtime
 * (where a real Blockly block satisfies the same `MetaBlock` shape).
 */
export class BlockSpec implements MetaBlock {
    readonly type: string;
    readonly fields: Record<string, string>;
    /** Head block of each statement input, keyed by input name. */
    readonly inputs: Record<string, BlockSpec | null>;
    /** Next block in this block's own statement chain. */
    next: BlockSpec | null = null;
    /**
     * Optional mutator state for blocks with a variadic shape (e.g.
     * `implementation`'s target count). The webview renderer passes it to the live
     * block's `loadExtraState` before setting fields, so the dynamic inputs
     * (`TARGET0`, `TARGET1`, …) exist first. Ignored by the serializer, which reads
     * the resulting fields directly.
     */
    extraState?: object;

    constructor(type: string, fields: Record<string, string> = {}, inputs: Record<string, BlockSpec | null> = {}) {
        this.type = type;
        this.fields = fields;
        this.inputs = inputs;
    }

    getFieldValue(name: string): string | null {
        return name in this.fields ? this.fields[name] : null;
    }

    getInputTargetBlock(name: string): MetaBlock | null {
        return this.inputs[name] ?? null;
    }

    getNextBlock(): MetaBlock | null {
        return this.next;
    }

    getExtraState(): Record<string, unknown> | null {
        return (this.extraState as Record<string, unknown> | undefined) ?? null;
    }
}

/** Link `blocks` into a single statement chain (head → next → …); returns the head. */
export function chain(blocks: BlockSpec[]): BlockSpec | null {
    for (let i = 0; i < blocks.length - 1; i++) {
        blocks[i].next = blocks[i + 1];
    }
    return blocks[0] ?? null;
}
