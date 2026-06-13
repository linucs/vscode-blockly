import { FirstPartyGenerator } from '../../../core/runtimeGenerator';

/**
 * First-party imperative block generators for the `arduino:cpp` runtime,
 * selected by a catalog block's `generator:` field (the imperative tier —
 * community catalogs may only use the declarative `codegen:` tier).
 *
 * Use this only for blocks the declarative engine genuinely cannot express —
 * today, "phantom container" blocks that re-route their nested statements into a
 * sketch section (e.g. `code_setup` → setup()) rather than emitting wrapping
 * syntax inline.
 */

/**
 * `code_setup`: nested blocks run once in setup(). Uses blockToCode (not
 * statementToCode) so the children stay at column 0 — assembleSketch indents the
 * setup() body once, which would otherwise double-indent.
 */
const codeSetup: FirstPartyGenerator = (block, generator) => {
    const target = block.getInputTargetBlock('MEMBERS');
    let members = target ? generator.blockToCode(target) : '';
    if (Array.isArray(members)) members = members[0];
    if (!members.trim()) return '';
    (generator as any).definitions_['setup_custom_' + block.id] = (members as string).replace(/\n$/, '');
    return '';
};

export const FIRST_PARTY_GENERATORS: Record<string, FirstPartyGenerator> = {
    code_setup: codeSetup,
};
