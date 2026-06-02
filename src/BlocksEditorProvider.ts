import * as vscode from 'vscode';
import * as path from 'path';
import { CatalogManager } from './catalog/CatalogManager';
import { filterEntriesForRuntime, composeRuntime } from './catalog/boardFilter';
import { ProjectConfig, resolveActiveEnv, toBoardContext } from './project/projectConfig';
import { loadProjectConfig } from './project/projectLoader';
import { companionUriFor, readCompanionWorkspace, writeCompanionWorkspace, companionExists } from './sidecar/companion';
import { languageForFile } from './codegen/sourceLanguage';
import { collectUsedBlockTypes } from './project/blockUsage';
import { collectRequirements } from './catalog/requirements';
import { mergeEnvLists } from './project/pio/iniMerge';
import { mergeSketchLibraries } from './project/arduino/sketchYamlMerge';

/**
 * Custom editor that opens directly on a source file (main.cpp, sketch.ino, …)
 * via "Open With…". The source file is the generation target; the Blockly
 * workspace lives in a companion `.blk` next to it.
 */
export class BlocksEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext, catalogManager: CatalogManager): vscode.Disposable {
        const provider = new BlocksEditorProvider(context, catalogManager);
        return vscode.window.registerCustomEditorProvider(BlocksEditorProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        });
    }

    private static readonly viewType = 'blocks-editor.editor';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly catalogManager: CatalogManager
    ) { }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        const sourceUri = document.uri;
        const language = languageForFile(sourceUri.fsPath) || 'cpp';
        const companion = companionUriFor(sourceUri);

        let project: ProjectConfig | undefined;
        let selectedEnv: string | undefined;

        if (!(await companionExists(companion)) && document.getText().trim().length > 0) {
            void vscode.window.showWarningMessage(
                `"${path.basename(sourceUri.fsPath)}" will be overwritten by the code generated from these blocks.`
            );
        }

        const updateWebview = async () => {
            const workspace = await readCompanionWorkspace(companion);
            webviewPanel.webview.postMessage({ type: 'update', state: workspace });
        };

        let projectLocalEntries: import('./catalog/CatalogTypes').CatalogEntry[] = [];

        const sendCatalog = () => {
            const activeEnv = project ? resolveActiveEnv(project, selectedEnv) : undefined;
            if (activeEnv) selectedEnv = activeEnv.name;

            const framework = activeEnv?.framework;
            const runtime = activeEnv && framework ? composeRuntime(framework, language) : undefined;
            const allEntries = [...this.catalogManager.getEntries(), ...projectLocalEntries];
            const entries = activeEnv && runtime
                ? filterEntriesForRuntime(allEntries, toBoardContext(activeEnv), runtime)
                : [];

            webviewPanel.webview.postMessage({
                type: 'init_catalog',
                hasBoard: !!activeEnv,
                framework,
                runtime,
                configType: project?.configType,
                envs: project?.envs.map(e => ({ name: e.name, platform: e.platform, board: e.board, framework: e.framework })) ?? [],
                selectedEnv: activeEnv?.name,
                entries,
            });
        };

        const reloadProject = async () => {
            project = await loadProjectConfig(sourceUri.fsPath);
            if (project) {
                const projectBlocksDir = path.join(path.dirname(project.configPath), '.blocks');
                await this.catalogManager.syncRemoteCatalogs(projectBlocksDir);
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
            } else {
                projectLocalEntries = [];
            }
            sendCatalog();
        };

        const changeCatalogSubscription = this.catalogManager.onDidChangeCatalogs(async () => {
            if (project) {
                const projectBlocksDir = path.join(path.dirname(project.configPath), '.blocks');
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
            }
            sendCatalog();
        });

        const remoteRefreshSubscription = this.catalogManager.onDidRequestRemoteRefresh(async () => {
            if (project) {
                const projectBlocksDir = path.join(path.dirname(project.configPath), '.blocks');
                await this.catalogManager.syncRemoteCatalogs(projectBlocksDir, true);
                projectLocalEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
                sendCatalog();
            }
        });

        const iniWatcher = vscode.workspace.createFileSystemWatcher('**/platformio.ini');
        const yamlWatcher = vscode.workspace.createFileSystemWatcher('**/sketch.yaml');
        const onConfigChange = () => { void reloadProject(); };
        iniWatcher.onDidCreate(onConfigChange);
        iniWatcher.onDidChange(onConfigChange);
        iniWatcher.onDidDelete(onConfigChange);
        yamlWatcher.onDidCreate(onConfigChange);
        yamlWatcher.onDidChange(onConfigChange);
        yamlWatcher.onDidDelete(onConfigChange);

        const getAutoGenerate = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<boolean>('generateOnChange', true);

        const getCategoryColors = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<Record<string, string>>('categoryColors', {});

        const getShowMinimap = () =>
            vscode.workspace.getConfiguration('blocks-editor').get<boolean>('showMinimap', false);

        const sendMode = () => {
            webviewPanel.webview.postMessage({ type: 'set_mode', autoGenerate: getAutoGenerate() });
        };

        const sendCategoryColors = () => {
            webviewPanel.webview.postMessage({ type: 'set_category_colors', colors: getCategoryColors() });
        };

        const sendMinimap = () => {
            webviewPanel.webview.postMessage({ type: 'set_minimap', show: getShowMinimap() });
        };

        const configSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('blocks-editor.generateOnChange')) sendMode();
            if (e.affectsConfiguration('blocks-editor.categoryColors')) sendCategoryColors();
            if (e.affectsConfiguration('blocks-editor.showMinimap')) sendMinimap();
        });

        const themeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
            webviewPanel.webview.postMessage({ type: 'theme_changed' });
        });

        webviewPanel.onDidDispose(() => {
            changeCatalogSubscription.dispose();
            remoteRefreshSubscription.dispose();
            iniWatcher.dispose();
            yamlWatcher.dispose();
            configSubscription.dispose();
            themeSubscription.dispose();
        });

        const applyCode = async (code: string, state: unknown) => {
            try {
                await this.writeSource(document, code);
                await this.syncProjectConfig(project, selectedEnv, state, language);
                webviewPanel.webview.postMessage({ type: 'generation_result', ok: true });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                webviewPanel.webview.postMessage({ type: 'generation_result', ok: false, error: msg });
            }
        };

        webviewPanel.webview.onDidReceiveMessage(async e => {
            switch (e.type) {
                case 'ready':
                    await reloadProject();
                    await updateWebview();
                    sendMode();
                    sendCategoryColors();
                    sendMinimap();
                    return;
                case 'select_env':
                    selectedEnv = e.env;
                    sendCatalog();
                    return;
                case 'change':
                    await writeCompanionWorkspace(companion, e.state);
                    if (typeof e.code === 'string') {
                        await applyCode(e.code, e.state);
                    }
                    return;

                case 'load_error': {
                    const blockType = /Invalid block definition for type:\s*(\S+)/.exec(e.error)?.[1];
                    if (blockType) {
                        vscode.window.showErrorMessage(
                            `Blocks Editor: unknown block type "${blockType}". ` +
                            `The .blk file references a block that is not in any loaded catalog. ` +
                            `Check that the required catalog is present in the project's .blocks/ folder or in blocks-editor.catalogPaths.`
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `Blocks Editor: failed to load workspace — ${e.error}`
                        );
                    }
                    return;
                }
                case 'dialog_prompt': {
                    const value = await vscode.window.showInputBox({
                        prompt: e.message,
                        value: e.defaultValue ?? '',
                    });
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: value ?? null,
                    });
                    return;
                }
                case 'dialog_confirm': {
                    const pick = await vscode.window.showWarningMessage(
                        e.message, { modal: true }, 'OK',
                    );
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: pick === 'OK',
                    });
                    return;
                }
                case 'dialog_alert': {
                    await vscode.window.showInformationMessage(e.message);
                    webviewPanel.webview.postMessage({
                        type: 'dialog_result', id: e.id,
                        value: undefined,
                    });
                    return;
                }
            }
        });
    }

    /**
     * Sync the project config file with the dependencies required by blocks in use.
     * Dispatches to the appropriate merge strategy based on project type.
     */
    private async syncProjectConfig(
        project: ProjectConfig | undefined,
        selectedEnv: string | undefined,
        state: unknown,
        language: string
    ): Promise<void> {
        const activeEnv = project ? resolveActiveEnv(project, selectedEnv) : undefined;
        if (!project || !activeEnv || !activeEnv.framework) return;

        const runtime = composeRuntime(activeEnv.framework, language);
        const projectBlocksDir = path.join(path.dirname(project.configPath), '.blocks');
        const localEntries = await this.catalogManager.loadEntriesFrom(projectBlocksDir);
        const allEntries = [...this.catalogManager.getEntries(), ...localEntries];
        const reqs = collectRequirements(allEntries, collectUsedBlockTypes(state), runtime);
        if (reqs.libDeps.length === 0) return;

        const uri = vscode.Uri.file(project.configPath);
        let content: string;
        try {
            content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        } catch {
            return;
        }

        let merged: string;
        let changed: boolean;

        if (project.configType === 'arduino') {
            ({ content: merged, changed } = mergeSketchLibraries(content, activeEnv.name, {
                libDeps: reqs.libDeps,
            }));
        } else {
            ({ content: merged, changed } = mergeEnvLists(content, activeEnv.name, {
                libDeps: reqs.libDeps,
            }));
        }

        if (changed) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(merged, 'utf8'));
        }
    }

    private writeSource(document: vscode.TextDocument, code: string) {
        if (document.getText() === code) return Promise.resolve(true);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), code);
        return vscode.workspace.applyEdit(edit);
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));

        return /* html */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Blocks Editor</title>
                <style>
                    body, html { margin: 0; padding: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
                    #toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, #454545); }
                    #toolbar .spacer { flex: 1; }
                    #toolbar label { font-size: 12px; opacity: 0.8; }
                    #editorArea { position: relative; flex-grow: 1; width: 100%; }
                    #blocklyDiv { position: absolute; inset: 0; }
                    #emptyState {
                        position: absolute; inset: 0; display: none;
                        flex-direction: column; align-items: center; justify-content: center;
                        text-align: center; padding: 24px; gap: 8px;
                        background: var(--vscode-editor-background, #1e1e1e);
                        color: var(--vscode-editor-foreground, #d4d4d4);
                        font-family: var(--vscode-font-family, sans-serif);
                    }
                    #emptyState.visible { display: flex; }
                    #emptyState .title { font-size: 14px; font-weight: 600; }
                    #emptyState .hint { font-size: 12px; opacity: 0.75; max-width: 420px; }

                    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer {
                        pointer-events: auto !important;
                    }
                    .blocklyToolboxCategoryContainer[aria-labelledby="toolbox-search-input.label"] {
                        margin: 0; padding: 0;
                    }
                    .blocklyToolboxCategory[id="toolbox-search-input"] {
                        padding: 6px 8px !important;
                        display: flex !important;
                        align-items: center !important;
                    }
                    .blocklyToolboxCategory[id="toolbox-search-input"] .blocklyTreeRowContentContainer {
                        display: flex;
                        align-items: center;
                        width: 100%;
                    }
                    input#toolbox-search-input {
                        width: 100%;
                        padding: 5px 8px;
                        margin: 0;
                        border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
                        border-radius: 3px;
                        background: var(--vscode-input-background, rgba(0,0,0,0.3));
                        color: var(--vscode-input-foreground, inherit);
                        font-size: 12px;
                        font-family: var(--vscode-font-family, sans-serif);
                        outline: none;
                        box-sizing: border-box;
                    }
                    input#toolbox-search-input:focus {
                        border-color: var(--vscode-focusBorder, #007fd4);
                    }
                    input#toolbox-search-input::placeholder {
                        color: var(--vscode-input-placeholderForeground, rgba(255,255,255,0.4));
                    }
                </style>
            </head>
            <body>
                <div id="toolbar">
                    <label id="envLabel" for="envSelect" style="display:none">Environment</label>
                    <vscode-dropdown id="envSelect" style="display:none"></vscode-dropdown>
                    <span class="spacer"></span>
                    <vscode-button id="generateBtn" disabled>Generate C++</vscode-button>
                </div>
                <div id="editorArea">
                    <div id="blocklyDiv"></div>
                    <div id="emptyState">
                        <div class="title">No board detected</div>
                        <div class="hint">Open this file inside a project containing a <code>platformio.ini</code> or <code>sketch.yaml</code> to load the blocks compatible with your board.</div>
                    </div>
                </div>
                <script type="module" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
