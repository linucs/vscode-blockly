import * as vscode from 'vscode';
import { httpGet } from '../../catalog/remoteCatalog';

const REPOS_URL = 'https://raw.githubusercontent.com/arduino/library-registry/refs/heads/main/repositories.txt';

interface CheckArduinoInput { libraryName: string }

let cachedRepos: string[] | undefined;

async function getRepos(): Promise<string[]> {
    if (cachedRepos) return cachedRepos;
    const buf = await httpGet(REPOS_URL);
    cachedRepos = buf.toString('utf-8').split('\n').filter(l => l.trim().length > 0);
    return cachedRepos;
}

export class CheckArduinoRegistryTool implements vscode.LanguageModelTool<CheckArduinoInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<CheckArduinoInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { libraryName } = options.input;
        const needle = libraryName.toLowerCase();

        try {
            const repos = await getRepos();
            const matches = repos.filter(r => r.toLowerCase().includes(needle));

            if (matches.length === 0) {
                return textResult(
                    `"${libraryName}" was NOT found in the Arduino Library Registry.\n` +
                    `It is not installable via "arduino-cli lib install". ` +
                    `You may need a url+ref dependency for Arduino CLI projects.`
                );
            }

            return textResult(
                `"${libraryName}" IS in the Arduino Library Registry (installable via "arduino-cli lib install").\n` +
                `Matching entries:\n${matches.map(m => `  ${m}`).join('\n')}`
            );
        } catch (err) {
            return textResult(`Arduino registry check failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
