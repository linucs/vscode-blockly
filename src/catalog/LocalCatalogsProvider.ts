import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { gatherInstalledCatalogs, LocalCatalog } from '../contribute/localCatalogs';
import { titleCase } from '../util/strings';
import { canEditInGuidedUi } from './canEditInGuidedUi';
import { CatalogEditorPanel } from './CatalogEditorPanel';

type LocalCatalogItem = VendorGroup | CatalogFileItem;

interface VendorGroup {
    kind: 'vendor';
    label: string;
    catalogs: LocalCatalog[];
}

interface CatalogFileItem {
    kind: 'file';
    catalog: LocalCatalog;
}

/**
 * Tree view of block catalogs installed in the project's `.blocks/` folder.
 * Mirrors {@link CatalogRegistryProvider} (the community catalog) but lists what
 * is actually on disk locally, with per-file Edit and Delete actions. Scanning,
 * YAML parsing and vendor inference are reused from {@link gatherInstalledCatalogs}.
 */
export class LocalCatalogsProvider implements vscode.TreeDataProvider<LocalCatalogItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<LocalCatalogItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly extensionUri: vscode.Uri) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: LocalCatalogItem): vscode.TreeItem {
        if (element.kind === 'vendor') {
            const item = new vscode.TreeItem(titleCase(element.label), vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('folder');
            return item;
        }

        const { catalog } = element;
        const label = catalog.id ? titleCase(catalog.id) : catalog.fileName;
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.description = catalog.category ?? catalog.fileName;
        item.resourceUri = vscode.Uri.file(catalog.fsPath);
        item.tooltip = new vscode.MarkdownString(
            `**${label}**\n\n` +
            (catalog.category ? `Category: ${catalog.category}  \n` : '') +
            `File: \`${catalog.fileName}\``
        );
        item.iconPath = new vscode.ThemeIcon('symbol-file');
        item.contextValue = 'localCatalog';
        return item;
    }

    async getChildren(element?: LocalCatalogItem): Promise<LocalCatalogItem[]> {
        if (!element) {
            const catalogs = await gatherInstalledCatalogs();
            const vendors = new Map<string, LocalCatalog[]>();
            for (const catalog of catalogs) {
                const vendor = catalog.vendor ?? '_ungrouped';
                if (!vendors.has(vendor)) vendors.set(vendor, []);
                vendors.get(vendor)!.push(catalog);
            }
            return Array.from(vendors.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([label, list]) => ({ kind: 'vendor' as const, label, catalogs: list }));
        }

        if (element.kind === 'vendor') {
            return element.catalogs.map(catalog => ({ kind: 'file' as const, catalog }));
        }

        return [];
    }

    /**
     * Edit a catalog file. Opens the guided editor unless the YAML uses
     * constructs the guided surface can't represent (multi-document, a
     * `generator:` block, a mutator, or a parse/schema error) — those fall back
     * to the raw-text editor via {@link canEditInGuidedUi}.
     */
    async edit(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') return;
        const fsPath = item.catalog.fsPath;

        let text: string;
        try {
            text = await fs.readFile(fsPath, 'utf-8');
        } catch {
            text = '';
        }

        if (canEditInGuidedUi(text).ok) {
            CatalogEditorPanel.createOrShow(this.extensionUri, fsPath);
            return;
        }

        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Contribute the catalog to the community, by handing its file URI to the
     * existing `blocks-editor.contributeCatalog` command (the one explorer/title
     * context menus already use) — we only adapt the tree item into a URI.
     */
    async contribute(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') return;
        await vscode.commands.executeCommand(
            'blocks-editor.contributeCatalog',
            vscode.Uri.file(item.catalog.fsPath)
        );
    }

    /** Delete a catalog file from disk, after explicit confirmation. */
    async delete(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') return;
        const { catalog } = item;
        const name = catalog.id ?? catalog.fileName;

        const confirm = vscode.l10n.t('Delete');
        const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Delete catalog "{0}"? This permanently removes the file {1}.', name, catalog.fileName),
            { modal: true },
            confirm
        );
        if (choice !== confirm) return;

        try {
            await fs.unlink(catalog.fsPath);
            this.refresh();
            vscode.window.showInformationMessage(vscode.l10n.t('Catalog "{0}" deleted.', name));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to delete catalog "{0}": {1}', name, msg)
            );
        }
    }
}
