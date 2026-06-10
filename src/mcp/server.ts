import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOL_DEFINITIONS, type ToolContext } from '../tools/registry';

/** Project root the server operates on (for resolving the project `.blocks/`). */
function workspaceRoot(): string {
    return process.env.BLOCKS_WORKSPACE_ROOT || process.cwd();
}

/** Directories scanned by list-builtin-blocks: bundled catalogs + project .blocks/. */
function builtinCatalogDirs(): string[] {
    // dist/mcp-server.js → ../catalogs (bundled in the .vsix alongside dist/)
    const bundled = path.join(__dirname, '..', 'catalogs');
    const projectBlocks = path.join(workspaceRoot(), '.blocks');
    return [bundled, projectBlocks];
}

function toolContext(): ToolContext {
    return { builtinCatalogDirs: builtinCatalogDirs() };
}

function text(value: string) {
    return { content: [{ type: 'text' as const, text: value }] };
}

function createServer(): McpServer {
    const server = new McpServer({ name: 'blocks-editor', version: '1.0.0' });

    for (const def of TOOL_DEFINITIONS) {
        server.registerTool(
            def.name,
            { description: def.description, inputSchema: def.inputSchema.shape },
            async (input: Record<string, unknown>) => text(await def.run(input, toolContext())),
        );
    }

    return server;
}

async function main(): Promise<void> {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    // stdout is reserved for the MCP protocol — log diagnostics to stderr.
    console.error('[blocks-editor MCP] fatal:', err instanceof Error ? err.stack : err);
    process.exit(1);
});
