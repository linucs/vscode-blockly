import type { CatalogEntry } from '../CatalogTypes';
import { readI18n } from './i18n';
import { buildImplementation } from './implementation';
import { extraState, field, mapChain, type MetaBlock } from './types';

/**
 * Build a {@link CatalogEntry} from the `catalog` hat block. `id`/`category` are
 * always emitted (required by the schema); the rest are omitted when their field
 * is empty. `description` is an {@link I18nText}: a plain string edited inline in
 * the DESCRIPTION field, or an i18n locale map carried verbatim in extraState
 * (M3 models both — see {@link readI18n}).
 */
export function buildCatalogEntry(block: MetaBlock): CatalogEntry {
    const entry: CatalogEntry = {
        id: field(block, 'ID'),
        category: field(block, 'CATEGORY'),
        implementations: [],
    };

    const state = extraState(block);
    const author = field(block, 'AUTHOR');
    const version = field(block, 'VERSION');
    // Colour comes solely from extraState — the source of truth for presence and
    // verbatim hex case. The `field_colour` itself can't be empty (it defaults to a
    // non-empty hex), so reading it directly would make every colour-less file gain
    // one; the meta-block's saveExtraState decides whether colour was authored.
    const colour = typeof state.colour === 'string' ? state.colour : '';
    // Description is an i18n value: a locale map lives in extraState, a plain
    // string in the DESCRIPTION field. Prefer the map when present.
    const description = readI18n(state.description) ?? (field(block, 'DESCRIPTION') || undefined);
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
