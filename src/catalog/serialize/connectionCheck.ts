import { BlockSpec } from './blockSpec';
import { field, mapChain, type MetaBlock } from './types';

/**
 * The `connection_check` meta-block models one Blockly connection-`check` type
 * string. A chain of them is the AND-list of accepted types for a connection
 * (`output`/`previousStatement`/`nextStatement`) or a value/statement input — so a
 * file's `check: "Number"` becomes one block, `check: ["A", "B"]` a chain of two,
 * and an absent check an empty chain. Shared by the serializer ({@link ./blockDef})
 * and the importer ({@link ./import}); pure and vscode-free so the Node round-trip
 * tests use it directly.
 */
export const CONNECTION_CHECK_TYPE = 'connection_check';

/**
 * A `connection_check` chain → a Blockly `check` value. Empty chain → `null`
 * ("any type"); one entry → that string; many → the array. Empty-valued blocks
 * (the "any" preset) contribute nothing, so they collapse the chain toward `null`.
 *
 * `asList` forces the array form even for a single entry, so a source `["String"]`
 * (a one-element array, which occurs in the corpus) round-trips as an array rather
 * than collapsing to the scalar `"String"`.
 */
export function checkChainToValue(head: MetaBlock | null, asList = false): null | string | string[] {
    const values = mapChain(head, b =>
        b.type === CONNECTION_CHECK_TYPE ? (field(b, 'VALUE') || null) : null,
    );
    if (values.length === 0) {
        return null;
    }
    if (asList || values.length > 1) {
        return values;
    }
    return values[0];
}

/**
 * A Blockly `check` value → a `connection_check` {@link BlockSpec} chain (inverse of
 * {@link checkChainToValue}). `null`/`undefined` → empty; a string → one block; an
 * array → one block per entry. The returned blocks are unlinked — callers pass them
 * through {@link ./blockSpec.chain}.
 */
export function valueToCheckChain(value: unknown): BlockSpec[] {
    if (value === null || value === undefined) {
        return [];
    }
    const list = Array.isArray(value) ? value : [value];
    return list
        .filter((v): v is string => typeof v === 'string' && v !== '')
        .map(v => new BlockSpec(CONNECTION_CHECK_TYPE, { VALUE: v }));
}
