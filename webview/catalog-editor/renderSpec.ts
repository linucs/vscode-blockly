import * as Blockly from 'blockly';
import type { BlockSpec } from '../../src/catalog/serialize/blockSpec';

/**
 * Render a {@link BlockSpec} tree (the importer's output) into real Blockly
 * blocks on `workspace`. The thin, webview-only inverse of the pure importer:
 * spec → live blocks. The serializer reads those live blocks back through the
 * same `MetaBlock` accessors a spec implements, so import→edit→serialize round-
 * trips. Returns the created top block (the `catalog` hat) or null.
 */
export function renderSpec(workspace: Blockly.Workspace, spec: BlockSpec | null): Blockly.Block | null {
    if (!spec) {
        return null;
    }
    const block = renderBlock(workspace, spec);
    return block;
}

function renderBlock(workspace: Blockly.Workspace, spec: BlockSpec): Blockly.Block {
    const block = workspace.newBlock(spec.type);

    // Apply variadic mutator state first, so dynamic fields (e.g. the
    // implementation block's TARGET{i} rows) exist before we set their values.
    if (spec.extraState) {
        (block as unknown as { loadExtraState?(s: object): void }).loadExtraState?.(spec.extraState);
    }

    for (const [name, value] of Object.entries(spec.fields)) {
        if (block.getField(name)) {
            block.setFieldValue(value, name);
        }
    }

    // Connect each statement-input chain to its slot.
    for (const [inputName, head] of Object.entries(spec.inputs)) {
        if (!head) {
            continue;
        }
        const input = block.getInput(inputName);
        const connection = input?.connection;
        if (connection) {
            connectChain(workspace, connection, head);
        }
    }

    if (block instanceof Blockly.BlockSvg) {
        block.initSvg();
    }
    return block;
}

/** Render a spec chain (head → next → …) and link it under `parentConnection`. */
function connectChain(
    workspace: Blockly.Workspace,
    parentConnection: Blockly.Connection,
    head: BlockSpec,
): void {
    let prev: Blockly.Connection | null = parentConnection;
    for (let s: BlockSpec | null = head; s; s = s.next) {
        const child = renderBlock(workspace, s);
        if (prev && child.previousConnection) {
            prev.connect(child.previousConnection);
        }
        prev = child.nextConnection;
    }
}
