import * as path from 'path';
import * as vscode from 'vscode';
import { BlocksEditorProvider } from './BlocksEditorProvider';
import { CatalogManager } from './catalog/CatalogManager';
import { CatalogRegistryProvider } from './catalog/CatalogRegistryProvider';
import { enableClaudeCodeIntegration } from './mcp/enableIntegration';
import { resolveActiveWorkspaceRoot } from './util/workspaceRoot';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Blocks Editor extension is now active.');

    const catalogManager = new CatalogManager(context);
    await catalogManager.init();

	context.subscriptions.push(BlocksEditorProvider.register(context, catalogManager));
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

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('blocks-editor.catalogPaths')) {
            await catalogManager.reloadCatalogs();
            vscode.window.showInformationMessage(vscode.l10n.t('Catalogs reloaded.'));
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.refreshCatalogs', async () => {
        await catalogManager.forceRefreshRemote();
        vscode.window.showInformationMessage(vscode.l10n.t('Remote catalogs re-downloaded and reloaded.'));
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.enableClaudeCodeIntegration', () =>
        enableClaudeCodeIntegration(context)
    ));

    const blocksWatcher = vscode.workspace.createFileSystemWatcher('**/.blocks/**/*.{yaml,yml}');
    const onBlocksChange = () => { void catalogManager.reloadCatalogs(); };
    blocksWatcher.onDidCreate(onBlocksChange);
    blocksWatcher.onDidChange(onBlocksChange);
    blocksWatcher.onDidDelete(onBlocksChange);
    context.subscriptions.push(blocksWatcher);

    const currentVersion: string = context.extension.packageJSON.version;
    const lastVersion = context.globalState.get<string>('lastVersion');
    if (lastVersion !== currentVersion) {
        context.globalState.update('lastVersion', currentVersion);
        vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'linucs.blocks-editor#blocks-editor.welcome',
            false
        );
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
