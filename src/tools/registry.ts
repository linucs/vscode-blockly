import { z } from 'zod';
import { fetchUrlText } from './fetchUrl';
import { searchPioRegistry } from './searchPioRegistry';
import { checkArduinoRegistry } from './checkArduinoRegistry';
import { validateCatalogYaml } from './validateCatalog';
import { saveCatalogFile } from './saveCatalog';
import { listBuiltinBlocks } from './listBuiltinBlocks';

/**
 * Single source of truth for the block-authoring tools.
 *
 * Each tool is defined ONCE here (name, description, input schema, handler) and
 * consumed by two host adapters:
 *  - `src/chat/lmTools.ts`  → registers them as `vscode.lm` LanguageModelTools (Copilot)
 *  - `src/mcp/server.ts`    → registers them on the MCP server (Claude Code)
 *
 * The logic itself lives in the sibling modules (fetchUrl.ts, validateCatalog.ts, …)
 * and stays free of any host (vscode / MCP) dependency.
 *
 * NOTE: VS Code additionally requires a STATIC declaration of the LM tools in
 * package.json under `contributes.languageModelTools` (names + schemas). That
 * manifest entry cannot be generated at runtime, so it must be kept in sync
 * with the `lmTool: true` entries below.
 */

/** Runtime context passed to a tool handler, supplied by each host. */
export interface ToolContext {
    /** Project root used for save-catalog and resolving project `.blocks/`. */
    workspaceRoot: string;
    /** Directories scanned by list-builtin-blocks (bundled catalogs + project). */
    builtinCatalogDirs: string[];
}

/** Optional confirmation prompt (Copilot `prepareInvocation` UI). */
export interface ToolConfirm {
    invocationMessage: string;
    title: string;
    message: string;
}

export interface ToolDefinition {
    /** Canonical short name (MCP tool name). The Copilot id is `blocks-editor-<name>`. */
    name: string;
    description: string;
    /** Zod object schema. MCP uses `.shape`; the LM manifest mirrors it in package.json. */
    inputSchema: z.ZodObject<z.ZodRawShape>;
    /** Whether to expose this tool to the Copilot `vscode.lm` host. */
    lmTool: boolean;
    run(input: Record<string, unknown>, ctx: ToolContext): Promise<string> | string;
    confirm?(input: Record<string, unknown>): ToolConfirm;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'fetch-url',
        description: 'Fetch any URL and return its text content. Use for reading library documentation, GitHub raw files (.h, .cpp, library.properties), and example sketches.',
        inputSchema: z.object({ url: z.string().describe('The URL to fetch') }),
        lmTool: true,
        run: (input) => fetchUrlText(String(input.url)),
    },
    {
        name: 'search-pio-registry',
        description: 'Search the PlatformIO library registry. Returns matching libraries with versions and descriptions.',
        inputSchema: z.object({ query: z.string().describe('Library name or keyword to search') }),
        lmTool: true,
        run: (input) => searchPioRegistry(String(input.query)),
    },
    {
        name: 'check-arduino-registry',
        description: 'Check if a library is in the Arduino Library Registry (installable via arduino-cli lib install). PIO and Arduino registries do not fully overlap — check both.',
        inputSchema: z.object({ libraryName: z.string().describe('Library name to look up') }),
        lmTool: true,
        run: (input) => checkArduinoRegistry(String(input.libraryName)),
    },
    {
        name: 'validate-catalog',
        description: 'Validate multi-document YAML against the block catalog schema and run structural checks (duplicate types, precedence, placeholders). Always validate before saving.',
        inputSchema: z.object({ yaml: z.string().describe('The YAML catalog content to validate') }),
        lmTool: true,
        run: (input) => validateCatalogYaml(String(input.yaml)),
    },
    {
        name: 'save-catalog',
        description: 'Save a YAML catalog file to the workspace .blocks/ directory. The extension auto-reloads catalogs when new files appear.',
        inputSchema: z.object({
            filename: z.string().describe('Filename (e.g. "wifinina.yaml")'),
            content: z.string().describe('The YAML content to save'),
        }),
        lmTool: true,
        run: (input, ctx) => saveCatalogFile(ctx.workspaceRoot, String(input.filename), String(input.content)),
        confirm: (input) => ({
            invocationMessage: `Save catalog to .blocks/${String(input.filename)}`,
            title: 'Save Block Catalog',
            message: `Save \`${String(input.filename)}\` to the workspace \`.blocks/\` directory?`,
        }),
    },
    {
        name: 'list-builtin-blocks',
        description: 'List the block types already provided by the extension (built-in L1/L2 blocks and project .blocks/ catalogs), grouped by category. Call this before designing blocks so you do not recreate ones that already exist.',
        inputSchema: z.object({}),
        // Copilot already gets built-in awareness injected into its system prompt,
        // so this is exposed only to the MCP host.
        lmTool: false,
        run: (_input, ctx) => listBuiltinBlocks(ctx.builtinCatalogDirs),
    },
];
