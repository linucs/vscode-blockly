import * as vscode from 'vscode';
import { buildSystemPrompt } from './systemPrompt';
import { registerLmTools, isOwnLmTool } from './lmTools';
import type { CatalogManager } from '../catalog/CatalogManager';

const PARTICIPANT_ID = 'blocks-editor.blockAuthor';
const MAX_TOOL_ROUNDS = 20;

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
    // Our own tools (declared in package.json, registered via registerLmTools)
    // and any tools contributed by other extensions all appear in vscode.lm.tools.
    return vscode.lm.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
    }));
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
    const externalTools = tools.filter(t => !isOwnLmTool(t.name));
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
        ...registerLmTools(),
    ];
}
