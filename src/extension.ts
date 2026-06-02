import * as vscode from 'vscode';
import { BlocksEditorProvider } from './BlocksEditorProvider';
import { CatalogManager } from './catalog/CatalogManager';
import { registerBlockAuthorParticipant } from './chat/blockAuthorParticipant';
import { enableClaudeCodeIntegration } from './mcp/enableIntegration';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Blocks Editor extension is now active.');

    const catalogManager = new CatalogManager(context);
    await catalogManager.init();

	context.subscriptions.push(BlocksEditorProvider.register(context, catalogManager));
	context.subscriptions.push(...registerBlockAuthorParticipant(context, catalogManager));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('blocks-editor.catalogPaths')) {
            await catalogManager.reloadCatalogs();
            vscode.window.showInformationMessage('Blocks Editor: Catalogs reloaded.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('blocks-editor.refreshCatalogs', async () => {
        await catalogManager.forceRefreshRemote();
        vscode.window.showInformationMessage('Blocks Editor: Remote catalogs re-downloaded and reloaded.');
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
}

export function deactivate() {}
