import { httpGet } from '../catalog/remoteCatalog';

interface PioPackage {
    name?: string;
    description?: string;
    version?: { name?: string };
    owner?: { username?: string };
}

/**
 * Search the PlatformIO library registry and return a formatted text summary
 * of the top matches. Host-agnostic.
 */
export async function searchPioRegistry(query: string): Promise<string> {
    const url = `https://api.registry.platformio.org/v3/packages?query=${encodeURIComponent(query)}`;

    try {
        const buf = await httpGet(url);
        const data = JSON.parse(buf.toString('utf-8'));
        const items: PioPackage[] = data.items ?? data ?? [];
        if (!Array.isArray(items) || items.length === 0) {
            return `No PlatformIO libraries found for "${query}".`;
        }

        const lines = items.slice(0, 10).map((pkg, i) => {
            const owner = pkg.owner?.username ?? '?';
            const ver = pkg.version?.name ?? '?';
            const desc = pkg.description ?? '';
            return `${i + 1}. ${owner}/${pkg.name} v${ver}\n   ${desc}\n   https://registry.platformio.org/libraries/${owner}/${pkg.name}`;
        });

        return `PlatformIO registry results for "${query}":\n\n${lines.join('\n\n')}`;
    } catch (err) {
        return `PIO registry search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
