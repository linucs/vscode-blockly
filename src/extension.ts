import * as path from 'path';
import * as vscode from 'vscode';
import { BlocksEditorProvider } from './BlocksEditorProvider';
import { CatalogEditorProvider } from './catalog/CatalogEditorProvider';
import { CatalogManager } from './catalog/CatalogManager';
import { CatalogRegistryProvider } from './catalog/CatalogRegistryProvider';
import { LocalCatalogsProvider } from './catalog/LocalCatalogsProvider';
import { enableClaudeCodeIntegration } from './mcp/enableIntegration';
import { contributeCatalog } from './contribute/contributeCatalog';
import { resolveActiveWorkspaceRoot } from './util/workspaceRoot';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Blocks Editor extension is now active.');

    const catalogManager = new CatalogManager(context);
    await catalogManager.init();

	context.subscriptions.push(BlocksEditorProvider.register(context, catalogManager));
	context.subscriptions.push(CatalogEditorProvider.register(context));
	registerMcpServerProvider(context);

    const registryProvider = new CatalogRegistryProvider(context);
    const registryTreeView = vscode.window.createTreeView('blocks-editor.catalogRegistry', {
        treeDataProvider: registryProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(registryTreeView);
    context.subscriptions.push(
        vscode.commands.registerCommand('blocks-editor.refreshRegistry', () => registryProvider.refresh()),
        vscode.commands.registerCommand('blocks-editor.searchRegistry', () => registryProvider.search()),
        vscode.commands.registerCommand('blocks-editor.downloadCatalog', (item) => registryProvider.download(item)),
    );

    const localCatalogsProvider = new LocalCatalogsProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.createTreeView('blocks-editor.localCatalogs', {
            treeDataProvider: localCatalogsProvider,
        }),
        vscode.commands.registerCommand('blocks-editor.refreshLocalCatalogs', () => localCatalogsProvider.refresh()),
        vscode.commands.registerCommand('blocks-editor.editLocalCatalog', (item) => localCatalogsProvider.edit(item)),
        vscode.commands.registerCommand('blocks-editor.contributeLocalCatalog', (item) => localCatalogsProvider.contribute(item)),
        vscode.commands.registerCommand('blocks-editor.deleteLocalCatalog', (item) => localCatalogsProvider.delete(item)),
    );

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('blocks-editor.catalogPaths')) {
            await catalogManager.reloadCatalogs();
            vscode.window.showInformationMessage(vscode.l10n.t('Catalogs reloaded.'));
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.openInBlocksEditor', async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
            return;
        }
        await vscode.commands.executeCommand('vscode.openWith', target, 'blocks-editor.editor');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.refreshCatalogs', async () => {
        await catalogManager.forceRefreshRemote();
        vscode.window.showInformationMessage(vscode.l10n.t('Remote catalogs re-downloaded and reloaded.'));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.enableClaudeCodeIntegration', () =>
        enableClaudeCodeIntegration(context)
    ));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.contributeCatalog', (uri?: vscode.Uri) =>
        contributeCatalog(uri)
    ));

    const blocksWatcher = vscode.workspace.createFileSystemWatcher('**/.blocks/**/*.{yaml,yml}');
    const onBlocksChange = () => {
        void catalogManager.reloadCatalogs();
        localCatalogsProvider.refresh();
    };
    blocksWatcher.onDidCreate(onBlocksChange);
    blocksWatcher.onDidChange(onBlocksChange);
    blocksWatcher.onDidDelete(onBlocksChange);
    context.subscriptions.push(blocksWatcher);

    maybeAnnounceVersion(context);
}

/**
 * Announce the packaged version once per version by comparing it against the one
 * stored in globalState: on first install open the Get Started walkthrough, and
 * after an update surface a "What's New" notification linking to the changelog.
 */
function maybeAnnounceVersion(context: vscode.ExtensionContext): void {
    const currentVersion: string = context.extension.packageJSON.version;
    const lastVersion = context.globalState.get<string>('lastVersion');
    if (lastVersion === currentVersion) {
        return;
    }
    context.globalState.update('lastVersion', currentVersion);

    if (lastVersion === undefined) {
        // Fresh install → Get Started walkthrough.
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'linucs.blocks-editor#blocks-editor.welcome',
            false
        );
        return;
    }

    // Update → changelog notification.
    void showUpdateNotification(context, currentVersion);
}

async function showUpdateNotification(
    context: vscode.ExtensionContext,
    version: string
): Promise<void> {
    const whatsNew = vscode.l10n.t("What's New");
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('Blocks Editor updated to v{0}', version),
        whatsNew
    );
    if (choice === whatsNew) {
        const uri = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
        void vscode.commands.executeCommand('markdown.showPreview', uri);
    }
}

/**
 * Expose the bundled MCP server (`dist/mcp-server.js`) to VS Code Copilot agent
 * mode with zero setup. Copilot consumes MCP servers contributed via
 * `registerMcpServerDefinitionProvider`; the same server is what Claude Code
 * connects to through `.mcp.json` (written by the "Set Up AI Assistants"
 * command). Two hosts, one server.
 *
 * The server is started with the editor's own Node (`process.execPath`, so no
 * `node` on PATH is required) and pointed at the active workspace folder via
 * `BLOCKS_WORKSPACE_ROOT` (used to resolve the project `.blocks/` for
 * list-builtin-blocks). The definitions are refreshed when the set of workspace
 * folders changes.
 */
function registerMcpServerProvider(context: vscode.ExtensionContext): void {
    const serverPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');
    const didChange = new vscode.EventEmitter<void>();
    context.subscriptions.push(didChange);
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => didChange.fire())
    );

    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('blocks-editor', {
            onDidChangeMcpServerDefinitions: didChange.event,
            async provideMcpServerDefinitions() {
                const root = await resolveActiveWorkspaceRoot();
                if (!root) return [];
                return [
                    new vscode.McpStdioServerDefinition(
                        'blocks-editor',
                        process.execPath,
                        [serverPath],
                        { BLOCKS_WORKSPACE_ROOT: root },
                        context.extension.packageJSON.version,
                    ),
                ];
            },
        })
    );
}

export function deactivate() {}
