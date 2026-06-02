import type { CatalogEntry } from '../catalog/CatalogTypes';

/**
 * Build the "Already Built-in Blocks" markdown section from a set of catalog
 * entries. Host-agnostic — consumed by both the Copilot system prompt
 * (buildSystemPrompt) and the MCP `list-builtin-blocks` tool, so it must NOT
 * import any host (vscode / MCP) or heavy (reference.md) dependency.
 */
export function summarizeBuiltinBlocks(entries: CatalogEntry[]): string {
    const lines: string[] = [];
    const byCategory = new Map<string, string[]>();

    for (const entry of entries) {
        for (const impl of entry.implementations) {
            for (const block of impl.blocks) {
                const type = block.blockly?.type as string | undefined;
                if (!type) continue;
                const cat = entry.category;
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat)!.push(type);
            }
        }
    }

    for (const [cat, types] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        lines.push(`- **${cat}**: ${types.join(', ')}`);
    }

    return `## Already Built-in Blocks (DO NOT suggest the user to recreate them)

The following blocks are already provided by the extension as L1 (language) and L2 (framework)
blocks. They are available to ALL boards. Do NOT create catalog blocks that duplicate
these — only create blocks for board-specific or library-specific features that go BEYOND this
standard set.

${lines.join('\n')}

When a user asks for blocks for a specific board, focus ONLY on what that board adds beyond
the standard framework API: onboard sensors, specific wireless modules, display controllers,
battery management, carrier/shield libraries, etc.`;
}
