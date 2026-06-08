import * as vscode from 'vscode';
import { TOOL_DEFINITIONS, type ToolDefinition, type ToolContext } from '../tools/registry';
import { resolveActiveWorkspaceRoot } from '../util/workspaceRoot';

/** Prefix mapping a registry tool `name` to its `vscode.lm` tool id. */
export const LM_TOOL_PREFIX = 'blocks-editor-';

/** True if a `vscode.lm` tool id belongs to this extension. */
export function isOwnLmTool(name: string): boolean {
    return name.startsWith(LM_TOOL_PREFIX);
}

/**
 * Generic adapter turning a host-agnostic {@link ToolDefinition} into a
 * `vscode.LanguageModelTool`. One class serves every tool — the behaviour comes
 * from the definition.
 */
class RegistryLmTool implements vscode.LanguageModelTool<Record<string, unknown>> {
    constructor(private readonly def: ToolDefinition) {}

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        if (!this.def.confirm) return undefined;
        const c = this.def.confirm(options.input);
        return {
            invocationMessage: c.invocationMessage,
            confirmationMessages: {
                title: c.title,
                message: new vscode.MarkdownString(c.message),
            },
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const ctx: ToolContext = {
            // Prefer the folder of the document being edited; no prompt — an LM
            // tool call shouldn't block on UI, so fall back to the first folder.
            workspaceRoot: (await resolveActiveWorkspaceRoot()) ?? '',
            builtinCatalogDirs: [], // list-builtin-blocks is not exposed to the LM host
        };
        const text = await this.def.run(options.input, ctx);
        return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
    }
}

/**
 * Register every `lmTool` definition with `vscode.lm`. Returns the disposables.
 * The tools must also be declared statically in package.json under
 * `contributes.languageModelTools` (a VS Code requirement).
 */
export function registerLmTools(): vscode.Disposable[] {
    return TOOL_DEFINITIONS
        .filter(def => def.lmTool)
        .map(def => vscode.lm.registerTool(LM_TOOL_PREFIX + def.name, new RegistryLmTool(def)));
}
