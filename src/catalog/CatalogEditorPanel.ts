import * as vscode from 'vscode';
import * as path from 'path';
import { loadL10nBundle, webviewDataScripts } from '../webviewHtml';
import { validateCatalogIssues } from './validateCatalog';
import { markSelfWrite, consumeSelfWrite } from './selfWriteRegistry';
import type { HostToWebviewMessage, WebviewToHostMessage } from './catalogEditorProtocol';

/**
 * Standalone webview panel hosting the Guided Catalog Editor for a single
 * `.blocks/**\/*.yaml` file. Deliberately a `WebviewPanel` (not a
 * CustomTextEditor — that would hijack every YAML file). The blocks/meta-block
 * surface arrives in M2; M1 is the end-to-end skeleton: load → edit → validate →
 * save, with self-write-aware external-change detection.
 */
export class CatalogEditorPanel {
    private static readonly viewType = 'blocks-editor.catalogEditor';
    /** One panel per file path; re-`reveal()` instead of opening a duplicate. */
    private static readonly panels = new Map<string, CatalogEditorPanel>();

    static createOrShow(extensionUri: vscode.Uri, fsPath: string): void {
        const existing = CatalogEditorPanel.panels.get(fsPath);
        if (existing) {
            existing.panel.reveal();
            return;
        }
        // The instance registers itself into the static map in its constructor.
        void new CatalogEditorPanel(extensionUri, fsPath);
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly fileName: string;
    private dirty = false;

    private constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly fsPath: string,
    ) {
        this.fileName = path.basename(fsPath);
        this.panel = vscode.window.createWebviewPanel(
            CatalogEditorPanel.viewType,
            this.fileName,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
            },
        );

        CatalogEditorPanel.panels.set(fsPath, this);
        void this.render();

        this.panel.webview.onDidReceiveMessage(
            (msg: WebviewToHostMessage) => this.onMessage(msg),
            undefined,
            this.disposables,
        );

        // Detect external edits: a change to our file that we didn't just write.
        const dir = path.dirname(fsPath);
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(dir), this.fileName),
        );
        const onExternal = (uri: vscode.Uri) => {
            if (uri.fsPath !== this.fsPath) return;
            if (consumeSelfWrite(this.fsPath)) return; // our own save — ignore
            this.post({ type: 'externalChange' });
        };
        watcher.onDidChange(onExternal, undefined, this.disposables);
        watcher.onDidCreate(onExternal, undefined, this.disposables);
        this.disposables.push(watcher);

        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }

    private post(msg: HostToWebviewMessage): void {
        void this.panel.webview.postMessage(msg);
    }

    private async onMessage(msg: WebviewToHostMessage): Promise<void> {
        switch (msg.type) {
            case 'ready':
                await this.loadFile();
                return;
            case 'dirty':
                this.setDirty(msg.value);
                return;
            case 'requestValidation':
                this.post({ type: 'validation', issues: validateCatalogIssues(msg.yamlText) });
                return;
            case 'save':
                await this.save(msg.yamlText);
                return;
            case 'fallbackToText':
                await this.openAsText();
                return;
            case 'open_url':
                if (/^https?:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                return;
        }
    }

    private async loadFile(): Promise<void> {
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(this.fsPath));
            const yamlText = Buffer.from(bytes).toString('utf8');
            this.setDirty(false);
            this.post({ type: 'load', yamlText, fileName: this.fileName });
        } catch (err) {
            this.post({ type: 'saveError', message: `Could not read ${this.fileName}: ${errText(err)}` });
        }
    }

    private async save(yamlText: string): Promise<void> {
        const issues = validateCatalogIssues(yamlText);
        this.post({ type: 'validation', issues });

        const blocking = issues.filter(i => i.severity === 'error');
        if (blocking.length > 0) {
            this.post({ type: 'saveError', message: `Not saved — fix ${blocking.length} issue(s) first.` });
            return;
        }

        try {
            markSelfWrite(this.fsPath);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.fsPath), Buffer.from(yamlText, 'utf8'));
            this.setDirty(false);
            this.post({ type: 'saved' });
        } catch (err) {
            this.post({ type: 'saveError', message: `Could not write ${this.fileName}: ${errText(err)}` });
        }
    }

    private async openAsText(): Promise<void> {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(this.fsPath));
        await vscode.window.showTextDocument(doc);
        this.panel.dispose();
    }

    private setDirty(value: boolean): void {
        if (this.dirty === value) return;
        this.dirty = value;
        this.panel.title = (value ? '● ' : '') + this.fileName;
    }

    private async render(): Promise<void> {
        const webview = this.panel.webview;
        const locale = vscode.env.language || 'en';
        const l10nBundle = await loadL10nBundle(this.extensionUri);
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'catalog-editor.js'));
        webview.html = this.getHtml(locale, l10nBundle, scriptUri);
    }

    private getHtml(locale: string, l10nBundle: string, scriptUri: vscode.Uri): string {
        return /* html */`
            <!DOCTYPE html>
            <html lang="${locale}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Catalog Editor</title>
                <style>
                    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden;
                        display: flex; flex-direction: column;
                        font-family: var(--vscode-font-family, sans-serif);
                        color: var(--vscode-foreground, #ccc);
                        background: var(--vscode-editor-background, #1e1e1e); }
                    #toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
                        border-bottom: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #toolbar .spacer { flex: 1; }
                    #fileName { font-size: 12px; opacity: 0.8; }
                    button { font-family: inherit; font-size: 12px; padding: 4px 12px; cursor: pointer;
                        border: none; border-radius: 2px;
                        color: var(--vscode-button-foreground, #fff);
                        background: var(--vscode-button-background, #0e639c); }
                    button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
                    button.secondary { color: var(--vscode-button-secondaryForeground, #fff);
                        background: var(--vscode-button-secondaryBackground, #3a3d41); }
                    #banner { display: none; align-items: center; gap: 8px; padding: 6px 8px;
                        background: var(--vscode-inputValidation-warningBackground, #352a05);
                        border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
                        font-size: 12px; }
                    #banner.visible { display: flex; }
                    #editorArea { flex: 1; display: flex; flex-direction: column; min-height: 0; }
                    #blocklyDiv { flex: 1; min-height: 0; }
                    #validation { max-height: 30%; overflow: auto; border-top: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #validation:empty { display: none; }
                    .issue { padding: 4px 10px; font-size: 12px; display: flex; gap: 6px; }
                    .issue.error { color: var(--vscode-errorForeground, #f48771); }
                    .issue .path { opacity: 0.7; }
                    #status { font-size: 12px; padding: 4px 10px; opacity: 0.8; min-height: 16px; }
                </style>
            </head>
            <body>
                <div id="banner">
                    <span id="bannerText">This file changed on disk outside the editor.</span>
                    <span class="spacer"></span>
                    <button id="reloadBtn" class="secondary" type="button">Reload</button>
                    <button id="dismissBtn" class="secondary" type="button">Continue</button>
                </div>
                <div id="toolbar">
                    <span id="fileName"></span>
                    <span class="spacer"></span>
                    <button id="saveBtn" type="button">Save</button>
                </div>
                <div id="editorArea">
                    <div id="blocklyDiv"></div>
                    <div id="status"></div>
                    <div id="validation"></div>
                </div>
                ${webviewDataScripts({ locale, l10nBundle, scriptUri })}
            </body>
            </html>`;
    }

    private dispose(): void {
        CatalogEditorPanel.panels.delete(this.fsPath);
        while (this.disposables.length) {
            this.disposables.pop()?.dispose();
        }
    }
}

function errText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
