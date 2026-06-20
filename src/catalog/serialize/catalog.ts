import type { CatalogEntry } from '../CatalogTypes';
import { readI18n } from './i18n';
import { buildImplementation } from './implementation';
import { extraState, field, mapChain, type MetaBlock } from './types';

/**
 * Build a {@link CatalogEntry} from the `catalog` hat block. `id`/`category` are
 * always emitted (required by the schema); the rest are omitted when their field
 * is empty. `description` is a plain string in M2 — files with an i18n-object
 * description are routed to the raw-text editor by the host gate, so they never
 * reach here.
 */
export function buildCatalogEntry(block: MetaBlock): CatalogEntry {
    const entry: CatalogEntry = {
        id: field(block, 'ID'),
        category: field(block, 'CATEGORY'),
        implementations: [],
    };

    const author = field(block, 'AUTHOR');
    const version = field(block, 'VERSION');
    const colour = field(block, 'COLOUR');
    // Description is an i18n value: a locale map lives in extraState, a plain
    // string in the DESCRIPTION field (M2). Prefer the map when present.
    const description = readI18n(extraState(block).description) ?? (field(block, 'DESCRIPTION') || undefined);
    if (author) { entry.author = author; }
    if (version) { entry.version = version; }
    if (colour) { entry.colour = colour; }
    if (description !== undefined) { entry.description = description; }

    const docs = buildDocs(block.getInputTargetBlock('DOCS'));
    if (docs) { entry.docs = docs; }

    entry.implementations = mapChain(block.getInputTargetBlock('IMPLEMENTATIONS'), buildImplementation);
    return entry;
}

/** Build the `docs` map (name → URL) from a `doc_link` chain; `undefined` if empty. */
function buildDocs(head: MetaBlock | null): Record<string, string> | undefined {
    const pairs = mapChain(head, b => {
        if (b.type !== 'doc_link') { return null; }
        const name = field(b, 'NAME');
        return name ? ([name, field(b, 'URL')] as [string, string]) : null;
    });
    return pairs.length > 0 ? Object.fromEntries(pairs) : undefined;
}
