import * as Blockly from 'blockly';
import type { CatalogIssue } from '../../src/catalog/catalogIssue';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/catalog/catalogEditorProtocol';
import { serializeWorkspace } from '../../src/catalog/serialize';
import type { MetaBlock, MetaWorkspace } from '../../src/catalog/serialize/types';
import { importCatalog } from '../../src/catalog/serialize/import';
import { firstDiffYaml, semanticallyEqualYaml } from '../../src/catalog/serialize/normalize';
// Register the same field + extension surface the runtime uses, so authored
// blocks (e.g. hat_event_style, field_param_input) preview faithfully.
import '../blockFields';
import { configureBlocklyLocale, installDialogBridge, injectThemedWorkspace } from '../blocklyBootstrap';
import { registerMetaBlocks, META_TOOLBOX } from './metaBlocks';
import { renderSpec } from './renderSpec';
import { initPreview, updatePreview } from './preview';
import { configureTranslation } from './ui/translationDialog';

/**
 * Guided Catalog Editor webview.
 *
 * A Blockly meta-workspace whose connection checks enforce the catalog schema by
 * construction. The host is a {@link vscode.CustomTextEditorProvider} bound to the
 * YAML document: on `load` the document text is imported into meta-blocks; every
 * edit re-serializes the workspace (the single producer) and posts `change`, which
 * the host writes into the document via a `WorkspaceEdit` — so dirty/undo/save are
 * native (no in-webview Save button). Only files the gate (`canEditInGuidedUi`)
 * deems fully modelable reach here; the rest fall back to the raw-text editor.
 */

const vscode = acquireVsCodeApi();

function post(msg: WebviewToHostMessage): void {
    vscode.postMessage(msg);
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const locale = configureBlocklyLocale();
// Route Blockly help links (window.open) through the host; the catalog editor
// has no dialog-driven blocks, so the returned bridge is unused.
installDialogBridge(vscode);
registerMetaBlocks();
// Seed the translation dialog with the editor locale; the 🔄 translate channel is
// wired in once the host reports `translateAvailability`.
configureTranslation({ locale });

// Pending LLM-translate requests, keyed by id (resolved by translated/translateError).
const pendingTranslations = new Map<number, { resolve: (text: string) => void; reject: (err: Error) => void }>();
let translateSeq = 0;

/** Post a translate request to the host and resolve when its reply arrives. */
function requestTranslate(text: string, from: string, to: string): Promise<string> {
    const id = ++translateSeq;
    return new Promise<string>((resolve, reject) => {
        pendingTranslations.set(id, { resolve, reject });
        post({ type: 'translate', id, text, from, to });
    });
}

let workspace: Blockly.WorkspaceSvg;
let loading = false;
let lastSerialized = '';
let validateTimer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(text: string): void {
    $<HTMLDivElement>('status').textContent = text;
}

function renderIssues(issues: CatalogIssue[]): void {
    const validationEl = $<HTMLDivElement>('validation');
    validationEl.replaceChildren();
    for (const issue of issues) {
        const row = document.createElement('div');
        row.className = `issue ${issue.severity}`;
        if (issue.path) {
            const path = document.createElement('span');
            path.className = 'path';
            path.textContent = `${issue.path}:`;
            row.appendChild(path);
        }
        const msg = document.createElement('span');
        msg.textContent = issue.message;
        row.appendChild(msg);
        validationEl.appendChild(row);
    }
}

function serialize(): string {
    return serializeWorkspace(workspace as unknown as MetaWorkspace);
}

function scheduleValidation(yamlText: string): void {
    if (validateTimer !== undefined) {
        clearTimeout(validateTimer);
    }
    validateTimer = setTimeout(() => post({ type: 'requestValidation', yamlText }), 400);
}

/** React to a meaningful workspace edit: re-serialize, push to the document, validate. */
function onWorkspaceChange(event: Blockly.Events.Abstract): void {
    if (loading || event.isUiEvent) {
        return;
    }
    const yamlText = serialize();
    if (yamlText === lastSerialized) {
        return;
    }
    lastSerialized = yamlText;
    setStatus('');
    post({ type: 'change', yamlText });
    scheduleValidation(yamlText);
}

function refreshPreview(selectedId?: string | null): void {
    let target: Blockly.Block | null = selectedId ? workspace.getBlockById(selectedId) : null;
    if (!target || target.type !== 'block_def') {
        target = workspace.getAllBlocks(false).find(b => b.type === 'block_def') ?? null;
    }
    updatePreview(target as unknown as MetaBlock | null, locale, text => {
        if (text) {
            setStatus(text);
        }
    });
}

/**
 * Debounce content-driven preview refreshes: `updatePreview` deep-clones the block
 * def, re-resolves i18n and re-`defineBlocksWithJsonArray`s on each call, so running
 * it on every keystroke is wasted churn. Selection changes still refresh immediately.
 */
function schedulePreview(): void {
    if (previewTimer !== undefined) {
        clearTimeout(previewTimer);
    }
    previewTimer = setTimeout(() => refreshPreview(), 150);
}

function loadCatalog(yamlText: string): void {
    loading = true;
    let notFaithful = false;
    let serialized = '';
    try {
        workspace.clear();
        const spec = importCatalog(yamlText);
        const hat = renderSpec(workspace, spec);
        if (hat instanceof Blockly.BlockSvg) {
            hat.moveBy(20, 20);
        }
        workspace.render();
        // Serialize once and reuse for the faithfulness check and the baseline below.
        serialized = serialize();
        // Import-time round-trip check (design "Drift-prevention" #1). This is a
        // *warning*, not a gate: an unedited workspace never posts a `change`, so a
        // stylistic or lossy mismatch can't touch the document until the user makes a
        // real edit. Denying block editing over it punishes the user for our
        // serializer's gaps, so we stay in blocks and just flag that the first save
        // will reformat the file.
        if (yamlText.trim() && !semanticallyEqualYaml(yamlText, serialized)) {
            console.warn('guided import not byte-faithful (first diff):', firstDiffYaml(yamlText, serialized));
            notFaithful = true;
        }
    } catch (err) {
        // A file that can't even be imported into the meta-model → raw-text editor.
        console.error('catalog import failed', err);
        post({ type: 'fallbackToText' });
        return;
    } finally {
        loading = false;
    }
    $<HTMLDivElement>('validation').replaceChildren();
    // Re-baseline so a re-import (initial load or external change) never echoes a
    // `change` back to the host.
    lastSerialized = serialized;
    setStatus(notFaithful ? 'Heads up: this file uses a style the editor will normalize when you save.' : '');
    refreshPreview();
}

document.addEventListener('DOMContentLoaded', () => {
    const blocklyDiv = $<HTMLDivElement>('blocklyDiv');
    ({ workspace } = injectThemedWorkspace(blocklyDiv, { toolbox: META_TOOLBOX }));
    Blockly.svgResize(workspace);
    workspace.addChangeListener(onWorkspaceChange);

    initPreview($<HTMLDivElement>('previewDiv'));
    // Refresh the preview when the selection changes or the content of a block edits.
    workspace.addChangeListener(event => {
        if (loading) {
            return;
        }
        if (event.type === Blockly.Events.SELECTED) {
            refreshPreview((event as Blockly.Events.Selected).newElementId);
        } else if (!event.isUiEvent) {
            schedulePreview();
        }
    });

    window.addEventListener('resize', () => Blockly.svgResize(workspace));

    // No Save button / Cmd-S handler: the host writes the bound document on every
    // `change`, so native VS Code save (and the dirty dot, undo, close prompt) apply.
    post({ type: 'ready' });
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'load':
            loadCatalog(msg.yamlText);
            return;
        case 'validation':
            renderIssues(msg.issues);
            return;
        case 'translateAvailability':
            // Hand the dialog a translate callback only when the host has the API;
            // otherwise the per-row 🔄 stays hidden (manual entry always works).
            configureTranslation({ locale, translate: msg.available ? requestTranslate : undefined });
            return;
        case 'translated':
            pendingTranslations.get(msg.id)?.resolve(msg.text);
            pendingTranslations.delete(msg.id);
            return;
        case 'translateError':
            pendingTranslations.get(msg.id)?.reject(new Error(msg.message));
            pendingTranslations.delete(msg.id);
            return;
    }
});
