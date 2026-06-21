import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';

/**
 * A local catalog YAML file that the user could contribute to the community
 * catalog. The `id`/`category` come from the first catalog document in the file;
 * `vendor` is inferred from the path layout (see {@link inferVendor}).
 */
export interface LocalCatalog {
    /** Absolute path on disk. */
    fsPath: string;
    /** File basename, e.g. `thermo.yaml` — the community repo names files by component. */
    fileName: string;
    /** `id` of the first catalog document, for labels/PR titles. */
    id?: string;
    /** `category` of the first catalog document, for the QuickPick description. */
    category?: string;
    /** Vendor folder inferred from a `.blocks/<vendor>/<file>` layout, else undefined. */
    vendor?: string;
}

/**
 * Gather candidate local catalog files the user might contribute: every YAML
 * under each workspace folder's `.blocks/` directory, plus the directories
 * listed in `blocks-editor.catalogPaths`. Built-in catalogs shipped with the
 * extension are deliberately excluded — you contribute your own authored blocks.
 */
export async function gatherLocalCatalogs(): Promise<LocalCatalog[]> {
    return scanRoots([...blocksRoots(), ...catalogPathRoots()]);
}

/**
 * Gather catalogs installed in the project's `.blocks/` folders only, excluding
 * the user-configured `catalogPaths`. Powers the Project Blocks tree view,
 * where each entry is a file the user can delete in place — shared `catalogPaths`
 * corpora must not be offered for deletion.
 */
export async function gatherInstalledCatalogs(): Promise<LocalCatalog[]> {
    return scanRoots(blocksRoots());
}

/** Each workspace folder's `.blocks/` directory. */
function blocksRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? [])
        .map(folder => path.join(folder.uri.fsPath, '.blocks'));
}

/** Extra catalog directories from the `blocks-editor.catalogPaths` setting. */
function catalogPathRoots(): string[] {
    const config = vscode.workspace.getConfiguration('blocks-editor');
    const customPaths: string[] = config.get('catalogPaths') || [];
    const firstFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const roots: string[] = [];
    for (const raw of customPaths) {
        const p = raw.trim();
        if (!p || /^https?:\/\//i.test(p)) continue;
        roots.push(path.isAbsolute(p) || !firstFolder ? p : path.join(firstFolder, p));
    }
    return roots;
}

/** Recursively collect every YAML catalog under the given roots, de-duplicated. */
async function scanRoots(roots: string[]): Promise<LocalCatalog[]> {
    const seen = new Set<string>();
    const results: LocalCatalog[] = [];
    for (const root of roots) {
        await collectFrom(root, root, seen, results);
    }
    results.sort((a, b) => (a.id ?? a.fileName).localeCompare(b.id ?? b.fileName));
    return results;
}

async function collectFrom(
    dir: string,
    blocksRoot: string,
    seen: Set<string>,
    out: LocalCatalog[]
): Promise<void> {
    let dirents: import('fs').Dirent[];
    try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return; // directory doesn't exist (no .blocks yet) or isn't readable
    }

    for (const dirent of dirents) {
        const full = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            await collectFrom(full, blocksRoot, seen, out);
        } else if (/\.ya?ml$/i.test(dirent.name) && !seen.has(full)) {
            seen.add(full);
            out.push(await readLocalCatalog(full, blocksRoot));
        }
    }
}

async function readLocalCatalog(fsPath: string, blocksRoot: string): Promise<LocalCatalog> {
    const catalog: LocalCatalog = {
        fsPath,
        fileName: path.basename(fsPath),
        vendor: inferVendor(fsPath, blocksRoot),
    };
    try {
        const content = await fs.readFile(fsPath, 'utf-8');
        const docs = yaml.loadAll(content) as Array<Record<string, unknown>>;
        const first = docs.find(d => d && typeof d === 'object' && 'id' in d);
        if (first) {
            catalog.id = typeof first.id === 'string' ? first.id : undefined;
            catalog.category = typeof first.category === 'string' ? first.category : undefined;
        }
    } catch {
        // Unreadable/invalid YAML — still offer the file; validation happens later.
    }
    return catalog;
}

/**
 * Infer the community-repo vendor folder from the file's location. Downloaded
 * catalogs mirror `catalogs/<vendor>/<file>` as `.blocks/<vendor>/<file>`, so the
 * directory immediately under the scan root is the vendor. A file sitting flat
 * in the root has no inferable vendor (the user is prompted instead).
 */
function inferVendor(fsPath: string, blocksRoot: string): string | undefined {
    const rel = path.relative(blocksRoot, fsPath);
    const parts = rel.split(path.sep);
    return parts.length >= 2 ? parts[0] : undefined;
}
