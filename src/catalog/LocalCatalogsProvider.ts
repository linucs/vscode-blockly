import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { gatherInstalledCatalogs, LocalCatalog } from '../contribute/localCatalogs';
import { titleCase } from '../util/strings';
import { canEditInGuidedUi } from './canEditInGuidedUi';
import { resolveActiveWorkspaceRoot } from '../util/workspaceRoot';
import { SUPPORTED_RUNTIMES } from '../codegen/runtimes';

/**
 * `id` must be a single kebab/snake-case token. Mirrors the `id` pattern in
 * block-catalog_v1.schema.json — keep in sync with that schema (the source of truth).
 */
const ID_PATTERN = /^[a-z0-9]+([_-][a-z0-9]+)*$/;

/**
 * `category` is `<category>[::<subcategory>…]`: each `::`-separated segment must be
 * non-empty and free of leading/trailing whitespace. Mirrors the `category` pattern in
 * block-catalog_v1.schema.json — keep in sync with that schema (the source of truth).
 */
const CATEGORY_PATTERN = /^[^\s:](?:[^:]*[^\s:])?(?:::[^\s:](?:[^:]*[^\s:])?)*$/;

/** Schema reference line the catalog editor and authored files carry at the top. */
const SCHEMA_COMMENT =
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json\n';

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
                if (!vendors.has(vendor)) {vendors.set(vendor, []);}
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
     * Create a new block catalog in the active workspace folder's `.blocks/` directory.
     * Walks the user through a short guided prompt (id → category → description → runtime),
     * writes a minimal valid scaffold, then opens it in the guided catalog editor so they
     * can start adding blocks. Any prompt dismissed with Esc aborts the whole flow.
     */
    async create(): Promise<void> {
        const root = await resolveActiveWorkspaceRoot(
            vscode.l10n.t('Select the workspace folder to add the catalog to')
        );
        if (!root) {
            vscode.window.showInformationMessage(
                vscode.l10n.t('Open a workspace folder first to create a catalog.')
            );
            return;
        }
        const blocksDir = path.join(root, '.blocks');

        const id = await vscode.window.showInputBox({
            title: vscode.l10n.t('New Catalog: identifier'),
            prompt: vscode.l10n.t('Unique catalog id (lowercase, words separated by - or _), e.g. modulino-thermo'),
            ignoreFocusOut: true,
            validateInput: async (value) => {
                const v = value.trim();
                if (!v) {return vscode.l10n.t('An id is required.');}
                if (!ID_PATTERN.test(v)) {
                    return vscode.l10n.t('Use lowercase letters, digits, and single - or _ separators (e.g. modulino-thermo).');
                }
                try {
                    await fs.access(path.join(blocksDir, `${v}.yaml`));
                    return vscode.l10n.t('A catalog named "{0}.yaml" already exists in this project.', v);
                } catch {
                    return undefined; // file doesn't exist — good
                }
            },
        });
        if (id === undefined) {return;}
        const trimmedId = id.trim();

        const category = await vscode.window.showInputBox({
            title: vscode.l10n.t('New Catalog: category'),
            prompt: vscode.l10n.t('Toolbox category, optionally with subcategories: <category>[::<subcategory>], e.g. Sensors::Temperature'),
            ignoreFocusOut: true,
            validateInput: (value) => {
                const v = value.trim();
                if (!v) {return vscode.l10n.t('A category is required.');}
                if (!CATEGORY_PATTERN.test(v)) {
                    return vscode.l10n.t('Use <category>[::<subcategory>]; each segment must be non-empty (e.g. Sensors::Temperature).');
                }
                return undefined;
            },
        });
        if (category === undefined) {return;}

        const description = await vscode.window.showInputBox({
            title: vscode.l10n.t('New Catalog: description (optional)'),
            prompt: vscode.l10n.t('Short description of what this catalog does. Leave blank to skip.'),
            ignoreFocusOut: true,
        });
        if (description === undefined) {return;}

        const runtime = await vscode.window.showQuickPick([...SUPPORTED_RUNTIMES], {
            title: vscode.l10n.t('New Catalog: runtime'),
            placeHolder: vscode.l10n.t('Target runtime (framework:language)'),
            ignoreFocusOut: true,
        });
        if (runtime === undefined) {return;}

        const content = this.buildScaffold(trimmedId, category.trim(), description.trim(), runtime);
        const fsPath = path.join(blocksDir, `${trimmedId}.yaml`);

        try {
            await fs.mkdir(blocksDir, { recursive: true });
            await fs.writeFile(fsPath, content, 'utf-8');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to create catalog "{0}": {1}', trimmedId, msg));
            return;
        }

        this.refresh();
        vscode.window.showInformationMessage(vscode.l10n.t('Catalog "{0}" created.', trimmedId));
        await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(fsPath), 'blocks-editor.catalogEditor');
    }

    /**
     * Serialize a minimal catalog scaffold. The `description` is emitted as an i18n map
     * (`{ en: … }`) when provided, and omitted entirely when blank. `js-yaml` handles
     * quoting of the category (contains `::`/spaces) and description; the schema comment
     * is prepended so the file matches authored catalogs.
     */
    private buildScaffold(id: string, category: string, description: string, runtime: string): string {
        const doc: Record<string, unknown> = {
            id,
            version: '0.0.1',
            category,
        };
        if (description) {
            doc.description = { en: description };
        }
        doc.implementations = [{ runtime, blocks: [] }];
        return SCHEMA_COMMENT + yaml.dump(doc, { lineWidth: 0, quotingType: '"' });
    }

    /**
     * Edit a catalog file. Opens the guided editor unless the YAML uses
     * constructs the guided surface can't represent (multi-document, a
     * `generator:` block, a mutator, or a parse/schema error) — those fall back
     * to the raw-text editor via {@link canEditInGuidedUi}.
     */
    async edit(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') {return;}
        const fsPath = item.catalog.fsPath;

        let text: string;
        try {
            text = await fs.readFile(fsPath, 'utf-8');
        } catch {
            text = '';
        }

        const uri = vscode.Uri.file(fsPath);
        if (canEditInGuidedUi(text).ok) {
            // Content gate stays in the command (a glob selector can't see file
            // contents): open the guided CustomTextEditor for modelable files only.
            await vscode.commands.executeCommand('vscode.openWith', uri, 'blocks-editor.catalogEditor');
            return;
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Contribute the catalog to the community, by handing its file URI to the
     * existing `blocks-editor.contributeCatalog` command (the one explorer/title
     * context menus already use) — we only adapt the tree item into a URI.
     */
    async contribute(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') {return;}
        await vscode.commands.executeCommand(
            'blocks-editor.contributeCatalog',
            vscode.Uri.file(item.catalog.fsPath)
        );
    }

    /** Delete a catalog file from disk, after explicit confirmation. */
    async delete(item: LocalCatalogItem): Promise<void> {
        if (item?.kind !== 'file') {return;}
        const { catalog } = item;
        const name = catalog.id ?? catalog.fileName;

        const confirm = vscode.l10n.t('Delete');
        const choice = await vscode.window.showWarningMessage(
            vscode.l10n.t('Delete catalog "{0}"? This permanently removes the file {1}.', name, catalog.fileName),
            { modal: true },
            confirm
        );
        if (choice !== confirm) {return;}

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
