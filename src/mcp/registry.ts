import { z } from 'zod';
import { validateCatalogYaml } from '../catalog/validateCatalog';
import { listBuiltinBlocks } from './listBuiltinBlocks';

/**
 * Single source of truth for the block-authoring tools.
 *
 * Only the two **bespoke, deterministic** tools live here — the ones that wrap
 * the extension's own bundled logic and therefore cannot be replaced by an
 * agent's native capabilities:
 *  - `validate-catalog`     → AJV schema + structural checks (validateCatalog.ts)
 *  - `list-builtin-blocks`  → scans the bundled + project catalogs
 *
 * Both are served once, to BOTH hosts, via the MCP server (`src/mcp/server.ts`):
 * Claude Code connects to it through `.mcp.json`, VS Code Copilot through the
 * `McpServerDefinitionProvider` registered in `src/extension.ts`. There is no
 * separate `vscode.lm` LM-tool delivery anymore.
 *
 * The logic itself lives in the sibling modules and stays free of any host
 * (vscode / MCP) dependency.
 */

/** Runtime context passed to a tool handler, supplied by the MCP host. */
export interface ToolContext {
    /** Directories scanned by list-builtin-blocks (bundled catalogs + project). */
    builtinCatalogDirs: string[];
}

export interface ToolDefinition {
    /** Canonical short name (MCP tool name). */
    name: string;
    description: string;
    /** Zod object schema. MCP uses `.shape`. */
    inputSchema: z.ZodObject<z.ZodRawShape>;
    run(input: Record<string, unknown>, ctx: ToolContext): Promise<string> | string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'validate-catalog',
        description: 'Validate one or more YAML catalog documents against the real block-catalog JSON schema (AJV) and run the structural checks the schema cannot express (duplicate block types, value-block precedence, {{placeholder}} consistency). Always validate before saving; fix every error and re-validate until it passes clean.',
        inputSchema: z.object({ yaml: z.string().describe('The YAML catalog content to validate') }),
        run: (input) => validateCatalogYaml(String(input.yaml)),
    },
    {
        name: 'list-builtin-blocks',
        description: "List every block type the extension already provides — the standard built-in blocks plus all catalogs loaded from the project's .blocks/ directory — grouped by category. Takes no arguments. Call it before designing new blocks so you never recreate an existing one; it reflects the installed extension's exact block set.",
        inputSchema: z.object({}),
        run: (_input, ctx) => listBuiltinBlocks(ctx.builtinCatalogDirs),
    },
];
