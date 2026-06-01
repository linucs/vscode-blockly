import * as vscode from 'vscode';
import { buildSystemPrompt } from './systemPrompt';
import { FetchUrlTool } from './tools/fetchUrl';
import { SearchPioRegistryTool } from './tools/searchPioRegistry';
import { CheckArduinoRegistryTool } from './tools/checkArduinoRegistry';
import { ValidateCatalogTool } from './tools/validateCatalog';
import { SaveCatalogTool } from './tools/saveCatalog';
import type { CatalogManager } from '../catalog/CatalogManager';

const PARTICIPANT_ID = 'blocks-editor.blockAuthor';
const MAX_TOOL_ROUNDS = 20;

const TOOL_DEFS: vscode.LanguageModelChatTool[] = [
    {
        name: 'blocks-editor-fetch-url',
        description: 'Fetch any URL and return its text content. Use for reading library documentation, GitHub raw files (.h, .cpp, library.properties), and example sketches.',
        inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'The URL to fetch' } },
            required: ['url']
        }
    },
    {
        name: 'blocks-editor-search-pio-registry',
        description: 'Search the PlatformIO library registry. Returns matching libraries with versions and descriptions.',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Library name or keyword to search' } },
            required: ['query']
        }
    },
    {
        name: 'blocks-editor-check-arduino-registry',
        description: 'Check if a library is in the Arduino Library Registry (installable via arduino-cli lib install). PIO and Arduino registries do not fully overlap — check both.',
        inputSchema: {
            type: 'object',
            properties: { libraryName: { type: 'string', description: 'Library name to look up' } },
            required: ['libraryName']
        }
    },
    {
        name: 'blocks-editor-validate-catalog',
        description: 'Validate multi-document YAML against the block catalog schema and run structural checks (duplicate types, precedence, placeholders). Always validate before saving.',
        inputSchema: {
            type: 'object',
            properties: { yaml: { type: 'string', description: 'The YAML catalog content to validate' } },
            required: ['yaml']
        }
    },
    {
        name: 'blocks-editor-save-catalog',
        description: 'Save a YAML catalog file to the workspace .blocks/ directory. The extension auto-reloads catalogs when new files appear.',
        inputSchema: {
            type: 'object',
            properties: {
                filename: { type: 'string', description: 'Filename (e.g. "wifinina.yaml")' },
                content: { type: 'string', description: 'The YAML content to save' }
            },
            required: ['filename', 'content']
        }
    }
];

const COMMAND_PREFIXES: Record<string, string> = {
    research: 'Start Phase 1 NOW. You MUST call these tools before responding:\n' +
        '1. blocks-editor-fetch-url on the library header (.h) from GitHub raw URL\n' +
        '2. blocks-editor-fetch-url on library.properties\n' +
        '3. blocks-editor-search-pio-registry for the library\n' +
        '4. blocks-editor-check-arduino-registry for the library\n' +
        '5. If the user gave a docs URL, blocks-editor-fetch-url on it\n' +
        'After calling all tools, summarize: class names, methods, return types, dependencies, targets.\n' +
        'Library: ',
    design: 'Start Phase 2: based on the research from Phase 1 (actual API data from tools, not memory), ' +
        'design the blocks. Remember: no codegen.setup at implementation level (WYSIWYG principle), ' +
        'provide explicit init blocks, include targets. Present the plan (Phase 2.5) for confirmation.',
    generate: 'Start Phase 3: generate the YAML catalog based on the confirmed design. ' +
        'You MUST call blocks-editor-validate-catalog before presenting the YAML. Fix any issues and re-validate. ' +
        'Then call blocks-editor-save-catalog to write the file(s).',
    validate: 'Call blocks-editor-validate-catalog NOW on the YAML catalog from this conversation. Report results.'
};

function gatherTools(): vscode.LanguageModelChatTool[] {
    const tools = [...TOOL_DEFS];
    for (const tool of vscode.lm.tools) {
        if (TOOL_DEFS.some(t => t.name === tool.name)) continue;
        tools.push({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        });
    }
    return tools;
}

function createHandler(catalogManager: CatalogManager): vscode.ChatRequestHandler {
    return async (request, context, response, token) => {
        const tools = gatherTools();
        const builtinEntries = catalogManager.getEntries();
        const messages = buildMessages(request, context, tools, builtinEntries);

        try {
            await runToolLoop(request, messages, tools, response, token);
        } catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                response.markdown(`**Error:** ${err.message}`);
            } else {
                response.markdown(`**Error:** ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        return {};
    };
}

function buildMessages(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    tools: vscode.LanguageModelChatTool[],
    builtinEntries?: import('../catalog/CatalogTypes').CatalogEntry[]
): vscode.LanguageModelChatMessage[] {
    const messages: vscode.LanguageModelChatMessage[] = [];

    let systemPrompt = buildSystemPrompt(builtinEntries);
    const externalTools = tools.filter(t => !TOOL_DEFS.some(d => d.name === t.name));
    if (externalTools.length > 0) {
        const lines = externalTools.map(t => `- **${t.name}**: ${t.description}`);
        systemPrompt += `\n\n## Additional Tools (from other extensions)\n\n` +
            `These tools are provided by other installed extensions. Use them when relevant:\n\n` +
            lines.join('\n');
    }
    messages.push(vscode.LanguageModelChatMessage.User(systemPrompt));

    for (const turn of context.history) {
        if (turn instanceof vscode.ChatRequestTurn) {
            messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
        } else if (turn instanceof vscode.ChatResponseTurn) {
            const text = turn.response
                .filter((part): part is vscode.ChatResponseMarkdownPart => part instanceof vscode.ChatResponseMarkdownPart)
                .map(part => part.value.value)
                .join('');
            if (text) messages.push(vscode.LanguageModelChatMessage.Assistant(text));
        }
    }

    let prompt = request.prompt;
    if (request.command && COMMAND_PREFIXES[request.command]) {
        prompt = COMMAND_PREFIXES[request.command] + prompt;
    }
    messages.push(vscode.LanguageModelChatMessage.User(prompt));

    return messages;
}

async function runToolLoop(
    request: vscode.ChatRequest,
    messages: vscode.LanguageModelChatMessage[],
    tools: vscode.LanguageModelChatTool[],
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (token.isCancellationRequested) return;

        const chatResponse = await request.model.sendRequest(messages, { tools }, token);

        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        let textContent = '';

        for await (const part of chatResponse.stream) {
            if (part instanceof vscode.LanguageModelTextPart) {
                response.markdown(part.value);
                textContent += part.value;
            } else if (part instanceof vscode.LanguageModelToolCallPart) {
                toolCalls.push(part);
            }
        }

        if (toolCalls.length === 0) return;

        const assistantParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
        if (textContent) assistantParts.push(new vscode.LanguageModelTextPart(textContent));
        assistantParts.push(...toolCalls);
        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));

        const resultParts: vscode.LanguageModelToolResultPart[] = [];
        for (const call of toolCalls) {
            if (token.isCancellationRequested) return;
            response.progress(`Running ${call.name}...`);
            try {
                const result = await vscode.lm.invokeTool(call.name, {
                    toolInvocationToken: request.toolInvocationToken,
                    input: call.input
                }, token);
                resultParts.push(new vscode.LanguageModelToolResultPart(call.callId, result.content));
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                resultParts.push(new vscode.LanguageModelToolResultPart(
                    call.callId,
                    [new vscode.LanguageModelTextPart(`Tool error: ${msg}`)]
                ));
            }
        }

        messages.push(vscode.LanguageModelChatMessage.User(resultParts));
    }

    response.markdown('\n\n*Reached maximum tool call rounds. Please continue the conversation to proceed.*');
}

export function registerBlockAuthorParticipant(context: vscode.ExtensionContext, catalogManager: CatalogManager): vscode.Disposable[] {
    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, createHandler(catalogManager));
    participant.iconPath = new vscode.ThemeIcon('symbol-misc');

    return [
        participant,
        vscode.lm.registerTool('blocks-editor-fetch-url', new FetchUrlTool()),
        vscode.lm.registerTool('blocks-editor-search-pio-registry', new SearchPioRegistryTool()),
        vscode.lm.registerTool('blocks-editor-check-arduino-registry', new CheckArduinoRegistryTool()),
        vscode.lm.registerTool('blocks-editor-validate-catalog', new ValidateCatalogTool()),
        vscode.lm.registerTool('blocks-editor-save-catalog', new SaveCatalogTool()),
    ];
}
