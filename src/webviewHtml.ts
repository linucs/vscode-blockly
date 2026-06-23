import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/**
 * Shared webview scaffolding for the extension's two browser bundles — the
 * Maker Block Studio (`dist/webview.js`) and the Guided Catalog Editor
 * (`dist/catalog-editor.js`). Pure host module: may use `vscode`/Node, never
 * imports from `webview/`.
 *
 * The l10n loaders read the same on-disk bundles both editors inject, and
 * {@link webviewDataScripts} emits the identical `<script>` data tags both
 * editors expect, so each provider only owns its own `<body>`.
 */

/** Block-message dictionaries injected into the webview (English base + active locale). */
export interface BlockMessages {
    en: string;
    locale: string;
}

async function readJsonBundle(extensionUri: vscode.Uri, relativePath: string): Promise<string> {
    const filePath = vscode.Uri.joinPath(extensionUri, ...relativePath.split('/'));
    try {
        const raw = await fs.readFile(filePath.fsPath, 'utf-8');
        JSON.parse(raw);
        return raw;
    } catch {
        return '{}';
    }
}

/** Load the extension-host l10n bundle for the active locale (`'{}'` for English/none). */
export async function loadL10nBundle(extensionUri: vscode.Uri): Promise<string> {
    const locale = vscode.env.language;
    if (!locale || locale === 'en') {return '{}';}
    return readJsonBundle(extensionUri, `l10n/bundle.l10n.${locale}.json`);
}

/** Load the custom-block message dictionaries (English base + active locale). */
export async function loadBlockMessages(extensionUri: vscode.Uri): Promise<BlockMessages> {
    const locale = vscode.env.language || 'en';
    const en = await readJsonBundle(extensionUri, 'l10n/blocks.en.json');
    const localeBundle = locale !== 'en'
        ? await readJsonBundle(extensionUri, `l10n/blocks.${locale}.json`)
        : '{}';
    return { en, locale: localeBundle };
}

export interface WebviewDataScriptsOptions {
    locale: string;
    l10nBundle: string;
    /** Omit for editors that don't render Blockly custom blocks (no message dictionaries needed). */
    blockMessages?: BlockMessages;
    /** Webview URI of the bundle's entry script (already passed through `asWebviewUri`). */
    scriptUri: vscode.Uri;
}

/**
 * Build the JSON data `<script>` tags plus the module script tag injected at the
 * end of a webview `<body>`. Whitespace between tags is irrelevant to the
 * rendered page, so lines are simply newline-joined.
 */
export function webviewDataScripts(opts: WebviewDataScriptsOptions): string {
    const lines = [
        `<script id="l10n-data" type="application/json">${opts.l10nBundle}</script>`,
        `<script id="l10n-locale" type="application/json">"${opts.locale || 'en'}"</script>`,
    ];
    if (opts.blockMessages) {
        lines.push(`<script id="block-messages-en" type="application/json">${opts.blockMessages.en}</script>`);
        lines.push(`<script id="block-messages-locale" type="application/json">${opts.blockMessages.locale}</script>`);
    }
    lines.push(`<script type="module" src="${opts.scriptUri}"></script>`);
    return lines.join('\n');
}
