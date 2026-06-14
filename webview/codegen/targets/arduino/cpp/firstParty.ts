import { FirstPartyGenerator } from '../../../core/runtimeGenerator';
import { routeToZone } from '../../shared/sectionRouters';

/**
 * First-party imperative block generators for the `arduino:cpp` runtime,
 * selected by a catalog block's `generator:` field (the imperative tier —
 * community catalogs may only use the declarative `codegen:` tier).
 *
 * Use this only for blocks the declarative engine genuinely cannot express —
 * today, "phantom container" blocks that re-route their nested statements into a
 * sketch section (`code_setup` → setup(), `code_includes` → includes,
 * `code_declaration` → global scope) rather than emitting wrapping syntax inline.
 * The routing is shared with the Python runtime via `routeToZone`.
 */
export const FIRST_PARTY_GENERATORS: Record<string, FirstPartyGenerator> = {
    code_setup: routeToZone('setup_'),
    code_includes: routeToZone('import_'),
    code_declaration: routeToZone('decl_'),
};
