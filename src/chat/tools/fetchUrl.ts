import * as vscode from 'vscode';
import { httpGet } from '../../catalog/remoteCatalog';

const MAX_CHARS = 30_000;

interface FetchUrlInput { url: string }

function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export class FetchUrlTool implements vscode.LanguageModelTool<FetchUrlInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<FetchUrlInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { url } = options.input;
        if (!/^https?:\/\//i.test(url)) {
            return textResult(`Invalid URL: ${url}. Must start with http:// or https://.`);
        }

        try {
            const buf = await httpGet(url);
            let text = buf.toString('utf-8');

            const isHtml = text.slice(0, 500).toLowerCase().includes('<html') ||
                           text.slice(0, 500).toLowerCase().includes('<!doctype');
            if (isHtml) text = stripHtml(text);

            if (text.length > MAX_CHARS) {
                text = text.slice(0, MAX_CHARS) + '\n\n(truncated)';
            }

            return textResult(text);
        } catch (err) {
            return textResult(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
