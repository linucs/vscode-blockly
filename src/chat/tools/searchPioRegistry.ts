import * as vscode from 'vscode';
import { httpGet } from '../../catalog/remoteCatalog';

interface SearchPioInput { query: string }

interface PioPackage {
    name?: string;
    description?: string;
    version?: { name?: string };
    owner?: { username?: string };
}

export class SearchPioRegistryTool implements vscode.LanguageModelTool<SearchPioInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<SearchPioInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { query } = options.input;
        const url = `https://api.registry.platformio.org/v3/packages?query=${encodeURIComponent(query)}`;

        try {
            const buf = await httpGet(url);
            const data = JSON.parse(buf.toString('utf-8'));
            const items: PioPackage[] = data.items ?? data ?? [];
            if (!Array.isArray(items) || items.length === 0) {
                return textResult(`No PlatformIO libraries found for "${query}".`);
            }

            const lines = items.slice(0, 10).map((pkg, i) => {
                const owner = pkg.owner?.username ?? '?';
                const ver = pkg.version?.name ?? '?';
                const desc = pkg.description ?? '';
                return `${i + 1}. ${owner}/${pkg.name} v${ver}\n   ${desc}\n   https://registry.platformio.org/libraries/${owner}/${pkg.name}`;
            });

            return textResult(`PlatformIO registry results for "${query}":\n\n${lines.join('\n\n')}`);
        } catch (err) {
            return textResult(`PIO registry search failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
