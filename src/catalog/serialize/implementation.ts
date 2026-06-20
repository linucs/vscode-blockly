import type { Implementation } from '../CatalogTypes';
import { buildDependency } from './dependency';
import { field, mapChain, type MetaBlock } from './types';

/**
 * Build an {@link Implementation} from an `implementation` block. `blocks` is
 * always `[]` in M2 — the guided editor only opens files that have no block
 * definitions (host gate), so a serialized metadata-only catalog is
 * schema-incomplete by design and the host correctly blocks its save until M3
 * adds block authoring. `targets` (the variadic `TARGET{i}` fields) and
 * `dependencies` are omitted when empty.
 */
export function buildImplementation(block: MetaBlock): Implementation {
    const impl: Implementation = {
        runtime: field(block, 'RUNTIME'),
        blocks: [],
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

    return impl;
}
