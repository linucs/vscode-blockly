import type { Dependency } from '../CatalogTypes';
import { field, type MetaBlock } from './types';

/**
 * Build a {@link Dependency} from a `dependency_*` block, discriminated by block
 * type. Optional fields are omitted when their text field is empty. Returns
 * `null` for an unrecognized block type (skipped by the chain walker).
 */
export function buildDependency(block: MetaBlock): Dependency | null {
    const name = field(block, 'NAME');

    switch (block.type) {
        case 'dependency_library': {
            const dep: Dependency = { type: 'library', name };
            const minVersion = field(block, 'MINVERSION');
            const url = field(block, 'URL');
            const ref = field(block, 'REF');
            if (minVersion) { dep.minVersion = minVersion; }
            if (url) { dep.url = url; }
            if (ref) { dep.ref = ref; }
            return dep;
        }
        case 'dependency_pip': {
            const dep: Dependency = { type: 'pip', name };
            const minVersion = field(block, 'MINVERSION');
            if (minVersion) { dep.minVersion = minVersion; }
            return dep;
        }
        case 'dependency_brick': {
            const dep: Dependency = { type: 'brick', name };
            // Variables are variadic `VARNAME{i}` = `VARVAL{i}` rows (the [+]/[−]
            // list). Enumerate until the first absent index; skip rows with an
            // empty name, but keep empty values (some brick vars default to "").
            const variables: Record<string, string> = {};
            let any = false;
            for (let i = 0; ; i++) {
                const rawName = block.getFieldValue(`VARNAME${i}`);
                if (rawName === null) {
                    break;
                }
                const key = rawName.trim();
                if (!key) {
                    continue;
                }
                variables[key] = block.getFieldValue(`VARVAL${i}`) ?? '';
                any = true;
            }
            if (any) { dep.variables = variables; }
            return dep;
        }
        default:
            return null;
    }
}
