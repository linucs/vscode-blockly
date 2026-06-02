import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Save a catalog YAML file into `<root>/.blocks/`. The filename is validated
 * (must be .yaml/.yml, no path separators, no `..`). `root` is passed
 * explicitly so this is host-agnostic. Returns a human-readable result message.
 */
export async function saveCatalogFile(root: string, filename: string, content: string): Promise<string> {
    if (!/\.ya?ml$/i.test(filename) || filename.includes('..') || /[/\\]/.test(filename)) {
        return `Invalid filename: "${filename}". Must be a .yaml file without path separators.`;
    }

    if (!root) {
        return 'No workspace folder available. Cannot save catalog file.';
    }

    const dir = path.join(root, '.blocks');
    const target = path.join(dir, filename);

    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(target, content, 'utf-8');
        return `Saved to ${target}. The catalog will be loaded automatically.`;
    } catch (err) {
        return `Save failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
