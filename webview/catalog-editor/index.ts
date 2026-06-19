import type { CatalogIssue } from '../../src/catalog/catalogIssue';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/catalog/catalogEditorProtocol';

/**
 * Guided Catalog Editor webview — M1 skeleton.
 *
 * Deliberately a plain textarea over the YAML: it proves the end-to-end
 * load → edit → validate → save round-trip and the host protocol before any
 * Blockly meta-blocks exist. M2 replaces the textarea with the meta-workspace;
 * the host contract (catalogEditorProtocol) stays the same.
 */

const vscode = acquireVsCodeApi();

function post(msg: WebviewToHostMessage): void {
    vscode.postMessage(msg);
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const yamlEl = $<HTMLTextAreaElement>('yaml');
const saveBtn = $<HTMLButtonElement>('saveBtn');
const fileNameEl = $<HTMLSpanElement>('fileName');
const statusEl = $<HTMLDivElement>('status');
const validationEl = $<HTMLDivElement>('validation');
const banner = $<HTMLDivElement>('banner');
const reloadBtn = $<HTMLButtonElement>('reloadBtn');
const dismissBtn = $<HTMLButtonElement>('dismissBtn');

let dirty = false;
let validateTimer: ReturnType<typeof setTimeout> | undefined;

function setDirty(value: boolean): void {
    if (dirty === value) return;
    dirty = value;
    post({ type: 'dirty', value });
}

function setStatus(text: string): void {
    statusEl.textContent = text;
}

function renderIssues(issues: CatalogIssue[]): void {
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

function requestValidation(): void {
    if (validateTimer !== undefined) clearTimeout(validateTimer);
    validateTimer = setTimeout(() => post({ type: 'requestValidation', yamlText: yamlEl.value }), 400);
}

function save(): void {
    setStatus('Saving…');
    post({ type: 'save', yamlText: yamlEl.value });
}

yamlEl.addEventListener('input', () => {
    setDirty(true);
    setStatus('');
    requestValidation();
});

saveBtn.addEventListener('click', save);

window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
    }
});

reloadBtn.addEventListener('click', () => {
    banner.classList.remove('visible');
    post({ type: 'ready' }); // host re-reads the file and posts a fresh `load`
});

dismissBtn.addEventListener('click', () => {
    banner.classList.remove('visible');
});

window.addEventListener('message', (event: MessageEvent<HostToWebviewMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'load':
            yamlEl.value = msg.yamlText;
            fileNameEl.textContent = msg.fileName;
            validationEl.replaceChildren();
            setDirty(false);
            setStatus('');
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
            banner.classList.add('visible');
            return;
    }
});

post({ type: 'ready' });
