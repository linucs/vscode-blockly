import type { CatalogIssue } from './catalogIssue';

/**
 * postMessage contract between the Guided Catalog Editor host
 * (`CatalogEditorProvider`, a {@link vscode.CustomTextEditorProvider}) and its
 * webview (`webview/catalog-editor`).
 *
 * vscode-free and Node-free so both bundles can `import type` it across the
 * host/browser boundary. The unions are exhaustive on `type`. The host is bound to
 * the YAML document: it `load`s the document text, the webview pushes edits back via
 * `change` (written with a `WorkspaceEdit`), and save/dirty/undo are native.
 */

/**
 * Host → Webview: deliver the YAML to edit. Sent on `ready` and again whenever the
 * bound document changes externally (split-view/undo/another tool), so the webview
 * re-imports. The filename isn't carried — the CustomTextEditor tab shows it natively.
 */
export interface LoadMessage {
    type: 'load';
    yamlText: string;
}

/** Host → Webview: validation results to render (inline + summary). */
export interface ValidationMessage {
    type: 'validation';
    issues: CatalogIssue[];
}

/**
 * Host → Webview: whether LLM-backed translation is available (the host's
 * `vscode.lm` API exists). Gates the per-row 🔄 in the translation dialog — the
 * editor stays fully functional (manual entry) when this is `false`.
 */
export interface TranslateAvailabilityMessage {
    type: 'translateAvailability';
    available: boolean;
}

/** Host → Webview: a completed translation, keyed back to its request `id`. */
export interface TranslatedMessage {
    type: 'translated';
    id: number;
    text: string;
}

/** Host → Webview: a translation request failed (no model, denied consent, error). */
export interface TranslateErrorMessage {
    type: 'translateError';
    id: number;
    message: string;
}

export type HostToWebviewMessage =
    | LoadMessage
    | ValidationMessage
    | TranslateAvailabilityMessage
    | TranslatedMessage
    | TranslateErrorMessage;

/** Webview → Host: webview is initialized (also used to (re)request a fresh load). */
export interface ReadyMessage {
    type: 'ready';
}

/**
 * Webview → Host: the serialised YAML for the current block workspace. The host
 * applies it to the bound document via a `WorkspaceEdit` (marking it dirty); the
 * user persists with native save. Replaces the old explicit `save`/`dirty` flow.
 */
export interface ChangeMessage {
    type: 'change';
    yamlText: string;
}

/** Webview → Host: validate this text without saving (debounced live validation). */
export interface RequestValidationMessage {
    type: 'requestValidation';
    yamlText: string;
}

/** Webview → Host: give up on guided editing and open the raw YAML as text. */
export interface FallbackToTextMessage {
    type: 'fallbackToText';
}

/** Webview → Host: open an external URL in the system browser. */
export interface OpenUrlMessage {
    type: 'open_url';
    url: string;
}

/**
 * Webview → Host: translate `text` from `from` to `to` via `vscode.lm`. The host
 * replies with {@link TranslatedMessage} / {@link TranslateErrorMessage} carrying
 * the same `id`. Best-effort; the click is the user-initiated action that triggers
 * model-access consent on first use.
 */
export interface TranslateMessage {
    type: 'translate';
    id: number;
    text: string;
    from: string;
    to: string;
}

export type WebviewToHostMessage =
    | ReadyMessage
    | ChangeMessage
    | RequestValidationMessage
    | FallbackToTextMessage
    | OpenUrlMessage
    | TranslateMessage;
