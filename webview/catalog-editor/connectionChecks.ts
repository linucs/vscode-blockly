/**
 * Connection-check type strings shared by the meta-blocks and the toolbox. They
 * are the single source of truth for what may nest where: a statement input with
 * `check: CHECK.X` only accepts a block whose `previousStatement`/`nextStatement`
 * is typed `CHECK.X`. This makes structurally-invalid catalogs impossible to
 * build (design §5b) without any imperative `onchange` validators.
 *
 * vscode-free, browser/Node-agnostic so the serializer tests can import it too.
 */
export const CHECK = {
    /** `implementation` blocks; only nest inside `catalog.IMPLEMENTATIONS`. */
    IMPLEMENTATION: 'Implementation',
    /** `dependency_*` blocks; only nest inside `implementation.DEPENDENCIES`. */
    DEPENDENCY: 'Dependency',
    /** `doc_link` blocks; only nest inside `catalog.DOCS`. */
    DOC: 'Doc',
} as const;
