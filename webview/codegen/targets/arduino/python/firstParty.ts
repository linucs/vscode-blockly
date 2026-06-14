import { FirstPartyGenerator } from '../../../core/runtimeGenerator';
import { routeToZone } from '../../shared/sectionRouters';

/**
 * First-party imperative block generators for the `arduino:python` runtime,
 * selected by a catalog block's `generator:` field. The section containers
 * (`code_includes`/`code_declaration`/`code_setup`) route their nested blocks
 * into the import / module-level / pre-loop zones via the shared `routeToZone`
 * factory — `assembleScript` then places each zone in the final script.
 */
export const FIRST_PARTY_GENERATORS: Record<string, FirstPartyGenerator> = {
    code_setup: routeToZone('setup_'),
    code_includes: routeToZone('import_'),
    code_declaration: routeToZone('decl_'),
};
