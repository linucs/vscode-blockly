import * as vscode from 'vscode';
import { loadL10nBundle, webviewDataScripts } from '../webviewHtml';
import { validateCatalogIssues } from './validateCatalog';
import { isExternalChange } from './catalogEditorSync';
import type { HostToWebviewMessage, WebviewToHostMessage, TranslateMessage } from './catalogEditorProtocol';

/**
 * Guided Catalog Editor — a {@link vscode.CustomTextEditorProvider} bound to a
 * `.blocks/**\/*.yaml` document (registered for that glob at `priority:"option"`,
 * so it is offered via "Open With…" and never auto-opens). The YAML file *is* the
 * source of truth: it is imported into the Blockly meta-workspace on load and the
 * workspace is serialised back into the document via a `WorkspaceEdit` on every
 * edit — so dirty state, undo, save, external-change and the close prompt are all
 * native (the same pattern as {@link BlocksEditorProvider.writeSource}).
 *
 * The webview, serializer (`serialize/*`), importer, preview and translation dialog
 * are shared verbatim with the rest of the editor; this class is only the host shell.
 */
export class CatalogEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'blocks-editor.catalogEditor';

    static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new CatalogEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(CatalogEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
            // Each document gets its own editor instance; we never need two views of one.
            supportsMultipleEditorsPerDocument: false,
        });
    }

    /** Cached l10n bundle (static file, read once and reused across editor opens). */
    private l10nBundle?: string;

    private constructor(private readonly context: vscode.ExtensionContext) {}

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
        };
        webviewPanel.webview.html = await this.getHtml(webviewPanel.webview);

        const post = (msg: HostToWebviewMessage): void => {
            void webviewPanel.webview.postMessage(msg);
        };

        // The text we last wrote ourselves — drives the re-entrancy guard so our own
        // WorkspaceEdit isn't re-imported as if it were an external edit.
        let lastSyncedText = document.getText();

        const loadIntoWebview = (): void => {
            const yamlText = document.getText();
            lastSyncedText = yamlText;
            post({ type: 'load', yamlText });
        };

        // Push block edits back into the document. A whole-document replace marks it
        // dirty natively; the user persists with Ctrl+S. Skip a no-op write so we
        // don't spam the undo stack when the serialised text is unchanged.
        const syncDocument = async (yamlText: string): Promise<void> => {
            if (yamlText === document.getText()) {
                lastSyncedText = yamlText;
                return;
            }
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), yamlText);
            lastSyncedText = yamlText;
            await vscode.workspace.applyEdit(edit);
        };

        const messageSub = webviewPanel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) =>
            this.onMessage(msg, document, webviewPanel, post, syncDocument),
        );

        // External / split-view / undo edits to this document → re-import. Our own
        // WorkspaceEdit is filtered out by the lastSyncedText comparison.
        const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() !== document.uri.toString()) {
                return;
            }
            if (isExternalChange(e.document.getText(), lastSyncedText)) {
                loadIntoWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            messageSub.dispose();
            changeSub.dispose();
        });
    }

    private async onMessage(
        msg: WebviewToHostMessage,
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        post: (msg: HostToWebviewMessage) => void,
        syncDocument: (yamlText: string) => Promise<void>,
    ): Promise<void> {
        switch (msg.type) {
            case 'ready':
                post({ type: 'load', yamlText: document.getText() });
                // API existence is checked synchronously — no `selectChatModels` probe
                // at load (that's reserved for the user-initiated 🔄 click, which
                // triggers model-access consent on first use).
                post({ type: 'translateAvailability', available: typeof vscode.lm?.selectChatModels === 'function' });
                return;
            case 'change':
                await syncDocument(msg.yamlText);
                return;
            case 'requestValidation':
                post({ type: 'validation', issues: validateCatalogIssues(msg.yamlText) });
                return;
            case 'translate':
                await this.translate(msg, post);
                return;
            case 'fallbackToText': {
                // A file that can't be modelled as blocks (e.g. opened directly now
                // that this editor is the default for `.blocks` YAML) → switch to the
                // plain text editor. `showTextDocument` never routes through a custom
                // editor, so it can't loop back into this (now-default) one; then close
                // the guided tab. (Avoids relying on the ambiguous openWith 'default'.)
                const doc = await vscode.workspace.openTextDocument(document.uri);
                await vscode.window.showTextDocument(doc);
                webviewPanel.dispose();
                return;
            }
            case 'open_url':
                if (/^https?:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                return;
        }
    }

    /**
     * Best-effort LLM translation via `vscode.lm` (optional integration — no hard
     * dependency on any provider). The 🔄 click is the user-initiated action that
     * triggers model-access consent on first use; any failure (no model, denied
     * consent, request error) comes back as a `translateError` the dialog shows
     * inline. Placeholders (`%1`, `{{NAME}}`) are preserved by instruction.
     */
    private async translate(msg: TranslateMessage, post: (msg: HostToWebviewMessage) => void): Promise<void> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            const model = models[0];
            if (!model) {
                post({ type: 'translateError', id: msg.id, message: 'No language model available.' });
                return;
            }
            const prompt =
                `Translate the following UI string from ${msg.from} to ${msg.to}. ` +
                'Preserve every placeholder such as %1, %2 and {{NAME}} exactly as-is. ' +
                'Reply with ONLY the translated string — no quotes, no explanation.\n\n' +
                msg.text;
            const response = await model.sendRequest(
                [vscode.LanguageModelChatMessage.User(prompt)],
                {},
                new vscode.CancellationTokenSource().token,
            );
            let out = '';
            for await (const chunk of response.text) {
                out += chunk;
            }
            post({ type: 'translated', id: msg.id, text: out.trim() });
        } catch (err) {
            post({ type: 'translateError', id: msg.id, message: errText(err) });
        }
    }

    private async getHtml(webview: vscode.Webview): Promise<string> {
        const locale = vscode.env.language || 'en';
        if (this.l10nBundle === undefined) {
            this.l10nBundle = await loadL10nBundle(this.context.extensionUri);
        }
        const l10nBundle = this.l10nBundle;
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'catalog-editor.js'));
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
                    #editorArea { flex: 1; display: flex; flex-direction: column; min-height: 0; }
                    #workArea { flex: 1; display: flex; min-height: 0; }
                    #blocklyDiv { flex: 1; min-width: 0; min-height: 0; }
                    /* Drive the Blockly canvas background from the live theme var
                       (not the ThemeAdapter's JS snapshot) so both the main and
                       preview workspaces always track the current VS Code theme,
                       including on theme switches. */
                    #blocklyDiv, #previewDiv { background: var(--vscode-editor-background, #1e1e1e); }
                    .blocklySvg { background-color: var(--vscode-editor-background, #1e1e1e) !important; }
                    .blocklyMainBackground { fill: var(--vscode-editor-background, #1e1e1e) !important; stroke: none !important; }
                    /* Toolbox (category sidebar) and flyout panel backgrounds, same
                       live-var approach so they track the theme too. (Blockly 12's
                       toolbox container is .blocklyToolbox, not .blocklyToolboxDiv.) */
                    .blocklyToolbox { background-color: var(--vscode-editorWidget-background, #252526) !important; }
                    .blocklyFlyoutBackground { fill: var(--vscode-editorWidget-background, #252526) !important; }
                    #previewPane { width: 320px; flex: 0 0 auto; display: flex; flex-direction: column; min-height: 0; }
                    /* Draggable splitter between the canvas and the preview pane. */
                    #previewGutter { flex: 0 0 6px; cursor: col-resize;
                        background: var(--vscode-editorWidget-border, #454545); }
                    #previewGutter:hover { background: var(--vscode-focusBorder, #007fd4); }
                    #previewLabel, #yamlLabel { font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
                        opacity: .7; padding: 4px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #yamlLabel { border-top: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #previewDiv { flex: 1 1 60%; min-height: 0; }
                    /* Second section: the selected block's YAML as it would be written. */
                    #yamlDiv { flex: 1 1 40%; min-height: 0; overflow: auto; margin: 0;
                        padding: 6px 8px; white-space: pre; tab-size: 2;
                        font-family: var(--vscode-editor-font-family, monospace);
                        font-size: var(--vscode-editor-font-size, 12px);
                        color: var(--vscode-editor-foreground, #ccc); }
                    #yamlDiv:empty::before { content: "Select a block to see its YAML."; opacity: .5; }
                    #validation { max-height: 30%; overflow: auto; border-top: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #validation:empty { display: none; }
                    .issue { padding: 4px 10px; font-size: 12px; display: flex; gap: 6px; }
                    .issue.error { color: var(--vscode-errorForeground, #f48771); }
                    .issue.warning { color: var(--vscode-editorWarning-foreground, #cca700); }
                    .issue.clickable { cursor: pointer; }
                    .issue.clickable:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.07)); }
                    .issue .path { opacity: 0.7; }
                    #status { font-size: 12px; padding: 4px 10px; opacity: 0.8; min-height: 16px; }
                    #status:empty { display: none; }
                    /* Theme the toolbox search input (kind: 'search') — same as the
                       main blocks editor, which Blockly otherwise leaves unstyled. */
                    .blocklyToolboxCategory[id="toolbox-search-input"] {
                        padding: 6px 8px !important;
                        display: flex !important;
                        align-items: center !important;
                    }
                    .blocklyToolboxCategoryContainer[aria-labelledby="toolbox-search-input.label"] {
                        margin: 0; padding: 0;
                    }
                    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer {
                        pointer-events: auto !important;
                        display: flex; align-items: center; width: 100%;
                    }
                    input#toolbox-search-input {
                        width: 100%; padding: 5px 8px; margin: 0;
                        border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
                        border-radius: 3px;
                        background: var(--vscode-input-background, rgba(0,0,0,0.3));
                        color: var(--vscode-input-foreground, inherit);
                        font-size: 12px; font-family: var(--vscode-font-family, sans-serif);
                        outline: none; box-sizing: border-box;
                    }
                    input#toolbox-search-input:focus { border-color: var(--vscode-focusBorder, #007fd4); }
                    input#toolbox-search-input::placeholder {
                        color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.4));
                    }
                </style>
            </head>
            <body>
                <div id="editorArea">
                    <div id="workArea">
                        <div id="blocklyDiv"></div>
                        <div id="previewGutter"></div>
                        <div id="previewPane">
                            <div id="previewLabel">Preview</div>
                            <div id="previewDiv"></div>
                            <div id="yamlLabel">Block YAML</div>
                            <pre id="yamlDiv"></pre>
                        </div>
                    </div>
                    <div id="status"></div>
                    <div id="validation"></div>
                </div>
                ${webviewDataScripts({ locale, l10nBundle, scriptUri })}
            </body>
            </html>`;
    }
}

function errText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
