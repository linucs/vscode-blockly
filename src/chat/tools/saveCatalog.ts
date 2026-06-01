import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

interface SaveInput { filename: string; content: string }

export class SaveCatalogTool implements vscode.LanguageModelTool<SaveInput> {
    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<SaveInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.PreparedToolInvocation | undefined> {
        return {
            invocationMessage: `Save catalog to .blocks/${options.input.filename}`,
            confirmationMessages: {
                title: 'Save Block Catalog',
                message: new vscode.MarkdownString(
                    `Save \`${options.input.filename}\` to the workspace \`.blocks/\` directory?`
                )
            }
        };
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<SaveInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { filename, content } = options.input;

        if (!/\.ya?ml$/i.test(filename) || filename.includes('..') || /[/\\]/.test(filename)) {
            return textResult(`Invalid filename: "${filename}". Must be a .yaml file without path separators.`);
        }

        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            return textResult('No workspace folder open. Cannot save catalog file.');
        }

        const dir = path.join(root, '.blocks');
        const target = path.join(dir, filename);

        try {
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(target, content, 'utf-8');
            return textResult(`Saved to ${target}. The catalog will be loaded automatically.`);
        } catch (err) {
            return textResult(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
