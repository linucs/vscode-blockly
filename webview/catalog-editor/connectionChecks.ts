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
    /** `block_def` blocks; only nest inside `implementation.BLOCKS`. */
    BLOCKDEF: 'BlockDef',
    /** `message_row` blocks; only nest inside `block_def.MESSAGES`. */
    MSGROW: 'MessageRow',
    /** arg blocks (`input_*`/`field_*`); only nest inside `message_row.ARGS`. */
    ARG: 'Arg',
    /** `code_line` blocks; only nest inside the codegen array slots. */
    CODELINE: 'CodeLine',
    /** `helper` blocks; only nest inside a `HELPERS` slot. */
    HELPER: 'Helper',
    /** `raw_blockly_prop` blocks; only nest inside `block_def.RAW_PROPS`. */
    RAWPROP: 'RawProp',
    /**
     * `connection_check` blocks; nest inside a connection's check slot
     * (`OUTPUTCHECK`/`TOPCHECK`/`BOTTOMCHECK`) or a value/statement input's `CHECK`
     * slot. A chain is the AND-list of accepted types.
     */
    CONNCHECK: 'ConnCheck',
    /** `extension` blocks; only nest inside `block_def.EXTENSIONS`. */
    EXTENSION: 'Extension',
} as const;
