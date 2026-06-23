import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { RegistryIndex, RegistryEntry } from './CatalogRegistryTypes';
import { httpGet } from './remoteCatalog';
import { activeDocumentUri, resolveActiveWorkspaceRoot } from '../util/workspaceRoot';
import { titleCase } from '../util/strings';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CatalogRegistryItem = VendorItem | EntryItem;

interface VendorItem {
    kind: 'vendor';
    label: string;
    entries: RegistryEntry[];
}

interface EntryItem {
    kind: 'entry';
    entry: RegistryEntry;
    installed: boolean;
}

function resolveLocaleString(value: string | Record<string, string> | undefined): string {
    if (!value) {return '';}
    if (typeof value === 'string') {return value;}
    const lang = vscode.env.language.split('-')[0];
    return value[lang] ?? value['en'] ?? Object.values(value)[0] ?? '';
}

export class CatalogRegistryProvider implements vscode.TreeDataProvider<CatalogRegistryItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CatalogRegistryItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private index: RegistryIndex | undefined;
    private lastFetch = 0;
    private fetching = false;
    private installedPaths = new Set<string>();

    constructor(private readonly context: vscode.ExtensionContext) { }

    getTreeItem(element: CatalogRegistryItem): vscode.TreeItem {
        if (element.kind === 'vendor') {
            const item = new vscode.TreeItem(titleCase(element.label), vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('folder');
            return item;
        }

        const { entry, installed } = element;
        const desc = resolveLocaleString(entry.description);
        const item = new vscode.TreeItem(titleCase(entry.id), vscode.TreeItemCollapsibleState.None);
        item.description = desc;
        const title = entry.version
            ? `**${titleCase(entry.id)}** \`v${entry.version}\``
            : `**${titleCase(entry.id)}**`;
        const author = entry.author ? `*${entry.author}*\n\n` : '';
        item.tooltip = new vscode.MarkdownString(
            `${title}\n\n${author}${desc}\n\n` +
            `Category: ${entry.category}  \n` +
            `Runtimes: ${entry.runtimes.join(', ')}  \n` +
            `Targets: ${entry.targets.length ? entry.targets.join(', ') : 'universal'}  \n` +
            `Blocks: ${entry.blockCount}`
        );
        item.iconPath = new vscode.ThemeIcon(installed ? 'check' : 'package');
        item.contextValue = installed ? 'catalogEntryInstalled' : 'catalogEntry';
        return item;
    }

    async getChildren(element?: CatalogRegistryItem): Promise<CatalogRegistryItem[]> {
        if (!this.index) {
            this.ensureIndex();
            return [];
        }

        if (!element) {
            await this.scanInstalledPaths();
            const vendors = new Map<string, RegistryEntry[]>();
            for (const entry of this.index.entries) {
                const parts = entry.path.replace(/^catalogs\//, '').split('/');
                const vendor = parts.length > 1 ? parts[0] : '_ungrouped';
                if (!vendors.has(vendor)) {vendors.set(vendor, []);}
                vendors.get(vendor)!.push(entry);
            }
            return Array.from(vendors.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([label, entries]) => ({ kind: 'vendor' as const, label, entries }));
        }

        if (element.kind === 'vendor') {
            return element.entries
                .sort((a, b) => a.id.localeCompare(b.id))
                .map(entry => ({
                    kind: 'entry' as const,
                    entry,
                    installed: this.isInstalled(entry),
                }));
        }

        return [];
    }

    async refresh(): Promise<void> {
        this.lastFetch = 0;
        this.index = undefined;
        await this.clearCache();
        this._onDidChangeTreeData.fire();
        await this.fetchIndex();
    }

    async search(): Promise<void> {
        await this.ensureIndexLoaded();
        if (!this.index) {return;}

        const items = this.index.entries.map(entry => {
            const vendor = entry.path.replace(/^catalogs\//, '').split('/')[0];
            return {
                label: titleCase(entry.id),
                description: `${vendor} — ${entry.category}`,
                detail: resolveLocaleString(entry.description),
                entry,
            };
        });

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t('Search community catalogs…'),
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (picked) {
            await this.download({ kind: 'entry', entry: picked.entry, installed: false });
        }
    }

    async download(item: CatalogRegistryItem): Promise<void> {
        if (item.kind !== 'entry') {return;}

        const root = await resolveActiveWorkspaceRoot(
            vscode.l10n.t('Select the folder to download the catalog into')
        );
        if (!root) {
            // No folder open → guide the user; picker dismissed → silent no-op.
            if (!vscode.workspace.workspaceFolders?.length) {
                vscode.window.showErrorMessage(
                    vscode.l10n.t('Open a project folder first to download catalogs.')
                );
            }
            return;
        }

        const { entry } = item;
        const relativePath = entry.path.replace(/^catalogs\//, '');
        const destPath = path.join(root, '.blocks', relativePath);

        try {
            await fs.mkdir(path.dirname(destPath), { recursive: true });
            const localRoot = this.resolveLocalRoot();
            const data = localRoot
                ? await fs.readFile(path.join(localRoot, entry.path))
                : await httpGet(entry.downloadUrl);
            await fs.writeFile(destPath, data);
            this._onDidChangeTreeData.fire();

            vscode.window.showInformationMessage(
                vscode.l10n.t('Catalog "{0}" downloaded.', entry.id)
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(
                vscode.l10n.t('Failed to download catalog "{0}": {1}', entry.id, msg)
            );
        }
    }

    private resolveBlocksDir(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {return undefined;}
        // Match download(): prefer the active document's folder so the tree's
        // "installed" markers reflect the project you're working in. Passive
        // scan — no prompt, fall back to the first folder.
        const activeUri = activeDocumentUri();
        const folder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;
        return path.join((folder ?? folders[0]).uri.fsPath, '.blocks');
    }

    private async scanInstalledPaths(): Promise<void> {
        this.installedPaths.clear();
        const blocksDir = this.resolveBlocksDir();
        if (!blocksDir) {return;}
        await this.collectYamlPaths(blocksDir, blocksDir);
    }

    private async collectYamlPaths(dir: string, root: string): Promise<void> {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.collectYamlPaths(full, root);
                } else if (/\.ya?ml$/i.test(entry.name)) {
                    this.installedPaths.add(path.relative(root, full));
                }
            }
        } catch { /* dir doesn't exist yet */ }
    }

    private isInstalled(entry: RegistryEntry): boolean {
        const relativePath = entry.path.replace(/^catalogs\//, '');
        return this.installedPaths.has(relativePath);
    }

    private isFresh(): boolean {
        return !!this.index && Date.now() - this.lastFetch < CACHE_TTL_MS;
    }

    private ensureIndex(): void {
        if (this.fetching || this.isFresh()) {return;}
        void this.fetchIndex();
    }

    private async ensureIndexLoaded(): Promise<void> {
        if (this.isFresh()) {return;}
        await this.fetchIndex();
    }

    private async fetchIndex(): Promise<void> {
        if (this.fetching) {return;}
        this.fetching = true;

        try {
            const source = this.resolveIndexSource();
            const buf = /^https?:\/\//i.test(source)
                ? await httpGet(source)
                : await fs.readFile(source);
            const parsed = JSON.parse(buf.toString('utf-8')) as RegistryIndex;

            if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
                throw new Error('Unsupported registry index format');
            }

            this.index = parsed;
            this.lastFetch = Date.now();
            await this.writeCache(parsed);
            this._onDidChangeTreeData.fire();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[CatalogRegistry] Failed to fetch index:', msg);
            if (!this.index) {
                const cached = await this.readCache();
                if (cached) {
                    this.index = cached;
                    this._onDidChangeTreeData.fire();
                }
            }
        } finally {
            this.fetching = false;
        }
    }

    /**
     * Env var BLOCKS_CATALOG_INDEX overrides the setting — accepts a local
     * file path or a URL, so you can test without pushing to GitHub.
     * When it's a local path, downloads also read from that directory
     * (see {@link resolveLocalRoot}).
     */
    private resolveIndexSource(): string {
        const envOverride = process.env['BLOCKS_CATALOG_INDEX'];
        if (envOverride) {return envOverride;}
        const config = vscode.workspace.getConfiguration('blocks-editor');
        return config.get('catalogRegistryUrl',
            'https://raw.githubusercontent.com/linucs/blocks-community-catalog/main/index.json');
    }

    private resolveLocalRoot(): string | undefined {
        const explicit = process.env['BLOCKS_CATALOG_ROOT'];
        if (explicit) {return explicit;}
        const indexSource = process.env['BLOCKS_CATALOG_INDEX'];
        if (indexSource && !/^https?:\/\//i.test(indexSource)) {return path.dirname(indexSource);}
        return undefined;
    }

    private async cacheFilePath(): Promise<string> {
        const dir = this.context.globalStorageUri.fsPath;
        await fs.mkdir(dir, { recursive: true });
        return path.join(dir, 'registry-index.json');
    }

    private async clearCache(): Promise<void> {
        try {
            const filePath = await this.cacheFilePath();
            await fs.unlink(filePath);
        } catch { /* file may not exist */ }
    }

    private async readCache(): Promise<RegistryIndex | undefined> {
        try {
            const filePath = await this.cacheFilePath();
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data) as RegistryIndex;
        } catch {
            return undefined;
        }
    }

    private async writeCache(index: RegistryIndex): Promise<void> {
        try {
            const filePath = await this.cacheFilePath();
            await fs.writeFile(filePath, JSON.stringify(index));
        } catch { /* best-effort */ }
    }
}
