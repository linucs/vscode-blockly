import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { CatalogEntry } from './CatalogTypes';
import { isUrl, downloadCatalog } from './remoteCatalog';
import schema from './block-catalog_v1.schema.json';

export class CatalogManager {
    private entries: CatalogEntry[] = [];
    private ajv: Ajv;
    private validate: any;

    private readonly _onDidChangeCatalogs = new vscode.EventEmitter<void>();
    /** Fires whenever the loaded catalog set changes, so open editors can refresh their toolbox. */
    public readonly onDidChangeCatalogs = this._onDidChangeCatalogs.event;

    constructor(private readonly extensionContext: vscode.ExtensionContext) {
        this.ajv = new Ajv({ allErrors: true });
        // The schema uses "format": "uri" for docs links. Ajv v8 moved formats
        // into a separate package and throws in strict mode on unknown formats,
        // so register them here — otherwise compile() fails and no blocks load.
        addFormats(this.ajv);
    }

    public async init(): Promise<void> {
        try {
            this.validate = this.ajv.compile(schema);
            await this.reloadCatalogs();
        } catch (error) {
            console.error('Failed to initialize CatalogManager:', error);
            vscode.window.showErrorMessage('Failed to initialize Blocks Editor Catalog Manager.');
        }
    }

    public async reloadCatalogs(forceDownload = false): Promise<void> {
        this.entries = [];

        // 1. Load built-in catalogs (if we put any in the extension)
        const builtInPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'catalogs');
        await this.loadCatalogsFromDirectory(builtInPath.fsPath);

        // 2. Download remote catalogs from URLs in settings to .blocks/
        await this.syncRemoteCatalogs(forceDownload);

        // 3. Load all catalogs from the project .blocks/ directory
        const blocksDir = this.getBlocksDir();
        if (blocksDir) await this.loadCatalogsFromDirectory(blocksDir);

        // 4. Load custom catalogs from local paths in settings
        const config = vscode.workspace.getConfiguration('blocks-editor');
        const customPaths: string[] = config.get('catalogPaths') || [];

        for (const rawPath of customPaths) {
            const customPath = rawPath.trim();
            if (!customPath || isUrl(customPath)) continue;

            let resolvedPath = customPath;
            if (!path.isAbsolute(customPath) && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                resolvedPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, customPath);
            }

            let exists = false;
            try {
                exists = (await fs.stat(resolvedPath)).isDirectory();
            } catch { /* ENOENT or not accessible */ }
            if (!exists) {
                vscode.window.showWarningMessage(
                    `Blocks Editor: catalog path not found or not a directory: ${resolvedPath}`
                );
                continue;
            }

            await this.loadCatalogsFromDirectory(resolvedPath);
        }

        console.log(`[CatalogManager] Loaded ${this.entries.length} block catalog entries.`);
        this._onDidChangeCatalogs.fire();
    }

    private getBlocksDir(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return undefined;
        return path.join(folders[0].uri.fsPath, '.blocks');
    }

    private async syncRemoteCatalogs(force: boolean): Promise<void> {
        const blocksDir = this.getBlocksDir();
        if (!blocksDir) return;

        const config = vscode.workspace.getConfiguration('blocks-editor');
        const paths: string[] = config.get('catalogPaths') || [];
        const urls = paths.map(p => p.trim()).filter(isUrl);
        if (urls.length === 0) return;

        for (const url of urls) {
            try {
                await downloadCatalog(url, blocksDir, force);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Blocks Editor: failed to download catalog from ${url}: ${msg}`);
            }
        }
    }

    private async loadCatalogsFromDirectory(dirPath: string): Promise<void> {
        await this.collectEntriesFromDirectory(dirPath, this.entries);
    }

    public getEntries(): CatalogEntry[] {
        return this.entries;
    }

    /**
     * Load and validate catalog entries from a directory without mutating the
     * global entry list.  Used by the editor provider to pick up project-local
     * `.blocks/` catalogs that live next to the project config file rather than
     * at the workspace root.
     */
    public async loadEntriesFrom(dirPath: string): Promise<CatalogEntry[]> {
        const entries: CatalogEntry[] = [];
        await this.collectEntriesFromDirectory(dirPath, entries);
        return entries;
    }

    private async collectEntriesFromDirectory(dirPath: string, out: CatalogEntry[]): Promise<void> {
        try {
            const stat = await fs.stat(dirPath);
            if (!stat.isDirectory()) return;

            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                    await this.collectEntriesFromFile(fullPath, out);
                } else {
                    const fileStat = await fs.stat(fullPath);
                    if (fileStat.isDirectory()) {
                        await this.collectEntriesFromDirectory(fullPath, out);
                    }
                }
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.warn(`[CatalogManager] Error reading directory ${dirPath}:`, error);
            }
        }
    }

    private async collectEntriesFromFile(filePath: string, out: CatalogEntry[]): Promise<void> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const documents = yaml.loadAll(content);

            for (const doc of documents) {
                if (!doc || typeof doc !== 'object') continue;

                if (this.validate(doc)) {
                    out.push(doc as CatalogEntry);
                } else {
                    console.warn(`[CatalogManager] Validation failed for entry in ${filePath}:`, this.ajv.errorsText(this.validate.errors));
                }
            }
        } catch (error) {
            console.error(`[CatalogManager] Failed to load catalog file ${filePath}:`, error);
        }
    }
}
