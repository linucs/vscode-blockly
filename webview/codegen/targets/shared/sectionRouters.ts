import { FirstPartyGenerator } from '../../core/runtimeGenerator';

/**
 * Section-container first-party generator factory, shared by every runtime.
 *
 * A section container is a "phantom" block: it emits nothing inline; instead it
 * captures its nested statements and routes them into a generation zone via the
 * generator's `definitions_` map, keyed by the conventional prefix that both the
 * C++ (`assembleSketch`) and Python (`assembleScript`) assemblers understand:
 *
 *   code_includes    → import_*  (C++ #include zone / Python import zone)
 *   code_declaration → decl_*    (C++ global scope / Python module level)
 *   code_setup       → setup_*   (C++ setup() / Python pre-loop)
 *
 * Uses blockToCode (not statementToCode) so children stay at column 0 — the
 * assembler indents each zone once, which would otherwise double-indent.
 */
export function routeToZone(prefix: string): FirstPartyGenerator {
    return (block, generator) => {
        const target = block.getInputTargetBlock('MEMBERS');
        let members = target ? generator.blockToCode(target) : '';
        if (Array.isArray(members)) members = members[0];
        if (!(members as string).trim()) return '';
        (generator as unknown as { definitions_: Record<string, string> })
            .definitions_[`${prefix}custom_${block.id}`] = (members as string).replace(/\n$/, '');
        return '';
    };
}
