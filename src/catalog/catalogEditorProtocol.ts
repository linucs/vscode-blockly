import type { CatalogIssue } from './catalogIssue';

/**
 * postMessage contract between the Guided Catalog Editor host
 * ({@link CatalogEditorPanel}) and its webview (`webview/catalog-editor`).
 *
 * vscode-free and Node-free so both bundles can `import type` it across the
 * host/browser boundary. The unions are exhaustive on `type`; the webview shell
 * is a minimal textarea in M1 and grows into the Blockly meta-workspace in M2,
 * but the contract is fixed here up front (design §6).
 */

/** Host → Webview: deliver the YAML to edit. */
export interface LoadMessage {
    type: 'load';
    yamlText: string;
    fileName: string;
}

/** Host → Webview: validation results to render (inline + summary). */
export interface ValidationMessage {
    type: 'validation';
    issues: CatalogIssue[];
}

/** Host → Webview: the file was written successfully. */
export interface SavedMessage {
    type: 'saved';
}

/** Host → Webview: the save was rejected (blocking issues) or failed to write. */
export interface SaveErrorMessage {
    type: 'saveError';
    message: string;
}

/** Host → Webview: the file changed on disk from outside this editor. */
export interface ExternalChangeMessage {
    type: 'externalChange';
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
    | SavedMessage
    | SaveErrorMessage
    | ExternalChangeMessage
    | TranslateAvailabilityMessage
    | TranslatedMessage
    | TranslateErrorMessage;

/** Webview → Host: webview is initialized (also used to (re)request a fresh load). */
export interface ReadyMessage {
    type: 'ready';
}

/** Webview → Host: unsaved-changes flag, drives the `● ` dirty marker in the title. */
export interface DirtyMessage {
    type: 'dirty';
    value: boolean;
}

/** Webview → Host: validate this text without saving (debounced live validation). */
export interface RequestValidationMessage {
    type: 'requestValidation';
    yamlText: string;
}

/** Webview → Host: validate and, if clean, persist this text. */
export interface SaveMessage {
    type: 'save';
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
    | DirtyMessage
    | RequestValidationMessage
    | SaveMessage
    | FallbackToTextMessage
    | OpenUrlMessage
    | TranslateMessage;
