import * as Blockly from 'blockly';

/**
 * The language-level (axis 1) codegen contract: everything about emitting code
 * that depends on the *language* alone (`cpp`, `python`, …), reusable across any
 * target/framework that shares that language.
 *
 * A `RuntimeGenerator` (axis 2) composes one of these with a target-specific
 * assembler. The agnostic `CodeFactory` reads `precedence` from here instead of
 * owning a language-specific table.
 */
export interface LanguageProfile {
    /** Canonical language id, e.g. `cpp`. */
    readonly id: string;
    /** Reserved words to register with the Blockly name database. */
    readonly reservedWords: readonly string[];
    /**
     * Catalog-facing precedence vocabulary (the `CodegenPrecedence` names —
     * ATOMIC/UNARY_PREFIX/MULTIPLICATION/… — see `src/catalog/CatalogTypes.ts`)
     * mapped to this language's numeric levels, used to decide parenthesisation
     * of declarative `codegen.precedence` value blocks. Distinct from the
     * imperative `ORDER` the L1 generators use internally.
     */
    readonly precedence: Readonly<Record<string, number>>;
    /** Install this language's L1 block generators onto the runtime's generator. */
    registerLanguageBlocks(
        generator: Blockly.CodeGenerator,
        ctx: { paramVarIds: ReadonlySet<string> },
    ): void;
}
