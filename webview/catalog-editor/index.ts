import * as Blockly from 'blockly';
import type { CatalogIssue } from '../../src/catalog/catalogIssue';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/catalog/catalogEditorProtocol';
import { serializeWorkspace } from '../../src/catalog/serialize';
import type { MetaWorkspace } from '../../src/catalog/serialize/types';
import { importCatalog } from '../../src/catalog/serialize/import';
import { configureBlocklyLocale, installDialogBridge, injectThemedWorkspace } from '../blocklyBootstrap';
import { registerMetaBlocks, META_TOOLBOX } from './metaBlocks';
import { renderSpec } from './renderSpec';

/**
 * Guided Catalog Editor webview — M2.
 *
 * A Blockly meta-workspace whose connection checks enforce the catalog schema by
 * construction. On `load` the host's YAML is imported into meta-blocks; every
 * edit re-serializes the workspace to YAML (the single producer) and round-trips
 * through the host for validation and save. Only files the gate
 * (`canEditInGuidedUi`) deems fully modelable reach here; the rest stay on the
 * raw-text editor. M3 adds block-definition authoring.
 */

const vscode = acquireVsCodeApi();

function post(msg: WebviewToHostMessage): void {
    vscode.postMessage(msg);
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

configureBlocklyLocale();
// Route Blockly help links (window.open) through the host; the catalog editor
// has no dialog-driven blocks, so the returned bridge is unused.
installDialogBridge(vscode);
registerMetaBlocks();

let workspace: Blockly.WorkspaceSvg;
let dirty = false;
let loading = false;
let lastSerialized = '';
let validateTimer: ReturnType<typeof setTimeout> | undefined;

function setDirty(value: boolean): void {
    if (dirty === value) {
        return;
    }
    dirty = value;
    post({ type: 'dirty', value });
}

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

/** React to a meaningful workspace edit: re-serialize, mark dirty, validate. */
function onWorkspaceChange(event: Blockly.Events.Abstract): void {
    if (loading || event.isUiEvent) {
        return;
    }
    const yamlText = serialize();
    if (yamlText === lastSerialized) {
        return;
    }
    lastSerialized = yamlText;
    setDirty(true);
    setStatus('');
    scheduleValidation(yamlText);
}

function save(): void {
    setStatus('Saving…');
    post({ type: 'save', yamlText: serialize() });
}

function loadCatalog(yamlText: string, fileName: string): void {
    loading = true;
    try {
        workspace.clear();
        const spec = importCatalog(yamlText);
        const hat = renderSpec(workspace, spec);
        if (hat instanceof Blockly.BlockSvg) {
            hat.moveBy(20, 20);
        }
        workspace.render();
    } catch (err) {
        // Anything the importer can't represent → hand back to the raw-text editor.
        console.error('catalog import failed', err);
        post({ type: 'fallbackToText' });
        return;
    } finally {
        loading = false;
    }
    $<HTMLSpanElement>('fileName').textContent = fileName;
    $<HTMLDivElement>('validation').replaceChildren();
    lastSerialized = serialize();
    setDirty(false);
    setStatus('');
}

document.addEventListener('DOMContentLoaded', () => {
    const blocklyDiv = $<HTMLDivElement>('blocklyDiv');
    ({ workspace } = injectThemedWorkspace(blocklyDiv, { toolbox: META_TOOLBOX }));
    Blockly.svgResize(workspace);
    workspace.addChangeListener(onWorkspaceChange);

    window.addEventListener('resize', () => Blockly.svgResize(workspace));

    $<HTMLButtonElement>('saveBtn').addEventListener('click', save);

    window.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            save();
        }
    });

    $<HTMLButtonElement>('reloadBtn').addEventListener('click', () => {
        $<HTMLDivElement>('banner').classList.remove('visible');
        post({ type: 'ready' }); // host re-reads the file and posts a fresh `load`
    });

    $<HTMLButtonElement>('dismissBtn').addEventListener('click', () => {
        $<HTMLDivElement>('banner').classList.remove('visible');
    });

    post({ type: 'ready' });
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'load':
            loadCatalog(msg.yamlText, msg.fileName);
            return;
        case 'validation':
            renderIssues(msg.issues);
            return;
        case 'saved':
            setDirty(false);
            setStatus('Saved.');
            return;
        case 'saveError':
            setStatus(msg.message);
            return;
        case 'externalChange':
            $<HTMLDivElement>('banner').classList.add('visible');
            return;
    }
});
