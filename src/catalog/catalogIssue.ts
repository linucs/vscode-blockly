/**
 * Structured validation finding. Lives in its own dependency-free module so the
 * webview can `import type` it (via the postMessage protocol) without dragging
 * the validator's AJV/JSON-schema imports into the browser bundle's typecheck.
 */
export interface CatalogIssue {
    severity: 'error' | 'warning';
    /**
     * `schema` for JSON-schema (AJV) violations — these mean the document can't
     * be represented in the guided editor and gate it to the raw-text fallback
     * (see canEditInGuidedUi). `structural` for the softer authoring checks
     * (duplicate types, precedence, placeholders) that the guided editor can
     * surface inline without falling back.
     */
    kind: 'schema' | 'structural';
    /**
     * Scope prefix for the finding, e.g. `Doc 1` or `Block "cpp_pin_mode"`, or
     * the empty string when the finding is not scoped to a doc/block. Kept
     * separate from `message` so consumers can group, while the string formatter
     * reconstructs the original flat rendering as `path: message`.
     */
    path: string;
    message: string;
}
