/**
 * Maps a {@link CatalogIssue} `path` scope string to the meta-block it refers to,
 * so the guided editor can surface validation inline (a warning icon on the block,
 * a click-to-focus summary row). The validator only ever sees serialized YAML, so
 * `path` is a human-readable scope — not a YAML/JSON path — emitted by
 * `validateCatalog.ts`. Observed forms:
 *   - `Block "<type>"`   → the `block_def` whose TYPE field equals `<type>`
 *   - `Catalog "<id>"`   → the single `catalog` root block
 *   - `Doc <N>` / ``     → no specific block (summary-only)
 *
 * Pure (vscode-free, no Blockly) so the parsing is unit-testable in Node; the
 * webview resolves the returned descriptor against the live workspace.
 */
export type IssueTarget =
    | { kind: 'block'; type: string }
    | { kind: 'catalog'; id: string };

const BLOCK_RE = /^Block "(.+)"$/;
const CATALOG_RE = /^Catalog "(.+)"$/;

export function issueTarget(path: string): IssueTarget | null {
    const block = BLOCK_RE.exec(path);
    if (block) {
        return { kind: 'block', type: block[1] };
    }
    const catalog = CATALOG_RE.exec(path);
    if (catalog) {
        return { kind: 'catalog', id: catalog[1] };
    }
    return null;
}
