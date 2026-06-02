import { httpGet } from '../catalog/remoteCatalog';

const MAX_CHARS = 30_000;

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

/**
 * Fetch a URL and return its text content. HTML is stripped to plain text and
 * output is truncated to {@link MAX_CHARS}. Host-agnostic (no vscode / MCP deps).
 */
export async function fetchUrlText(url: string): Promise<string> {
    if (!/^https?:\/\//i.test(url)) {
        return `Invalid URL: ${url}. Must start with http:// or https://.`;
    }

    try {
        const buf = await httpGet(url);
        let text = buf.toString('utf-8');

        const head = text.slice(0, 500).toLowerCase();
        const isHtml = head.includes('<html') || head.includes('<!doctype');
        if (isHtml) text = stripHtml(text);

        if (text.length > MAX_CHARS) {
            text = text.slice(0, MAX_CHARS) + '\n\n(truncated)';
        }

        return text;
    } catch (err) {
        return `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
