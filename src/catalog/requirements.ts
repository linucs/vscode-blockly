import { CatalogEntry, LibraryDependency, PipDependency, BrickDependency } from './CatalogTypes';

/**
 * Dependencies required by the blocks in use, bucketed by dependency type and
 * kept as structured deps (NOT pre-formatted). Each project backend formats and
 * routes the buckets it supports into its own config file(s):
 *   - `library` → platformio.ini `lib_deps` / sketch.yaml `libraries`
 *   - `pip`     → requirements.txt   (arduino-app backend, future)
 *   - `brick`   → app.yaml           (arduino-app backend, future)
 * Buckets a given backend doesn't support are simply ignored.
 */
export interface ProjectRequirements {
    library: LibraryDependency[];
    pip: PipDependency[];
    brick: BrickDependency[];
}

function libraryKey(dep: LibraryDependency): string {
    return `${dep.name}|${dep.url ?? ''}|${dep.ref ?? ''}|${dep.minVersion ?? ''}`;
}

/**
 * Gather the dependencies required by the blocks currently in use.
 *
 * Dependencies live at the implementation level, so an implementation
 * contributes its requirements if ANY of its block types is used. Only
 * implementations matching the active runtime are considered. Deps are returned
 * structured and de-duplicated per type; formatting is the backend's concern.
 */
export function collectRequirements(
    entries: CatalogEntry[],
    usedBlockTypes: Iterable<string>,
    runtime: string
): ProjectRequirements {
    const used = new Set(usedBlockTypes);
    const library: LibraryDependency[] = [];
    const pip: PipDependency[] = [];
    const brick: BrickDependency[] = [];
    const seen = { library: new Set<string>(), pip: new Set<string>(), brick: new Set<string>() };

    const addUnique = <T>(bucket: T[], set: Set<string>, key: string, dep: T): void => {
        if (set.has(key)) {return;}
        set.add(key);
        bucket.push(dep);
    };

    for (const entry of entries) {
        const impl = entry.implementations.find(i => i.runtime.trim().toLowerCase() === runtime);
        if (!impl) {continue;}
        if (!impl.blocks.some(b => used.has(b.blockly?.type))) {continue;}

        for (const dep of impl.dependencies ?? []) {
            switch (dep.type) {
                case 'library':
                    addUnique(library, seen.library, libraryKey(dep), dep);
                    break;
                case 'pip':
                    addUnique(pip, seen.pip, `${dep.name}|${dep.minVersion ?? ''}`, dep);
                    break;
                case 'brick':
                    addUnique(brick, seen.brick, `${dep.name}|${JSON.stringify(dep.variables ?? {})}`, dep);
                    break;
            }
        }
    }

    return { library, pip, brick };
}
