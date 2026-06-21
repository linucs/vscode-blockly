import type { CodegenSections, Implementation } from '../CatalogTypes';
import { assignSections, buildBlockDefinition } from './blockDef';
import { buildDependency } from './dependency';
import { field, mapChain, type MetaBlock } from './types';

/**
 * Build an {@link Implementation} from an `implementation` block. `blocks` is
 * walked from the `BLOCKS` slot (M3 block authoring); impl-level `codegen` from
 * the implementation's own code-line slots. `targets` (the variadic `TARGET{i}`
 * fields) and `dependencies` are omitted when empty.
 */
export function buildImplementation(block: MetaBlock): Implementation {
    const blocks = mapChain(block.getInputTargetBlock('BLOCKS'), buildBlockDefinition);
    const impl: Implementation = {
        runtime: field(block, 'RUNTIME'),
        blocks,
    };

    // Targets are variadic `TARGET{i}` fields on the implementation block (the
    // [+]/[−] list). Enumerate them until the first absent index.
    const targets: string[] = [];
    for (let i = 0; ; i++) {
        const value = block.getFieldValue(`TARGET${i}`);
        if (value === null) {
            break;
        }
        const trimmed = value.trim();
        if (trimmed) {
            targets.push(trimmed);
        }
    }
    if (targets.length > 0) {
        impl.targets = targets;
    }

    const dependencies = mapChain(block.getInputTargetBlock('DEPENDENCIES'), buildDependency);
    if (dependencies.length > 0) {
        impl.dependencies = dependencies;
    }

    const codegen: CodegenSections = {};
    assignSections(codegen, block);
    if (Object.keys(codegen).length > 0) {
        impl.codegen = codegen;
    }

    // A metadata-only implementation (no blocks yet) is schema-incomplete by
    // design — real files omit `blocks` rather than writing `blocks: []`, so omit
    // it here too for a faithful round-trip (the host validator flags it on save).
    if (blocks.length === 0) {
        delete (impl as Partial<Implementation>).blocks;
    }

    return impl;
}
