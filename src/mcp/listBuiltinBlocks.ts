import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { summarizeBuiltinBlocks } from './builtinBlocksSummary';

async function collectEntries(dir: string, out: CatalogEntry[]): Promise<void> {
    let files: string[];
    try {
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) return;
        files = await fs.readdir(dir);
    } catch {
        return; // ENOENT or not accessible — skip silently
    }

    for (const file of files) {
        const full = path.join(dir, file);
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
            try {
                const text = await fs.readFile(full, 'utf-8');
                for (const doc of yaml.loadAll(text)) {
                    if (doc && typeof doc === 'object') out.push(doc as CatalogEntry);
                }
            } catch { /* skip unparseable file */ }
        } else {
            try {
                if ((await fs.stat(full)).isDirectory()) await collectEntries(full, out);
            } catch { /* skip */ }
        }
    }
}

/**
 * List the block types already provided by the given catalog directories,
 * grouped by category, so the assistant does not recreate existing blocks.
 * Host-agnostic.
 */
export async function listBuiltinBlocks(catalogDirs: string[]): Promise<string> {
    const entries: CatalogEntry[] = [];
    for (const dir of catalogDirs) {
        await collectEntries(dir, entries);
    }

    if (entries.length === 0) {
        return 'No built-in catalog entries found.';
    }

    return summarizeBuiltinBlocks(entries);
}
