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

export type HostToWebviewMessage =
    | LoadMessage
    | ValidationMessage
    | SavedMessage
    | SaveErrorMessage
    | ExternalChangeMessage;

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

export type WebviewToHostMessage =
    | ReadyMessage
    | DirtyMessage
    | RequestValidationMessage
    | SaveMessage
    | FallbackToTextMessage
    | OpenUrlMessage;
