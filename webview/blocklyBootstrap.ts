import * as Blockly from 'blockly';
import * as En from 'blockly/msg/en';
import * as It from 'blockly/msg/it';
import * as ZhHans from 'blockly/msg/zh-hans';
import * as ZhHant from 'blockly/msg/zh-hant';
import * as Fr from 'blockly/msg/fr';
import * as De from 'blockly/msg/de';
import * as Es from 'blockly/msg/es';
import * as Ja from 'blockly/msg/ja';
import * as Ko from 'blockly/msg/ko';
import * as Ru from 'blockly/msg/ru';
import * as PtBr from 'blockly/msg/pt-br';
import * as Tr from 'blockly/msg/tr';
import * as Pl from 'blockly/msg/pl';
import * as Cs from 'blockly/msg/cs';
import * as Hu from 'blockly/msg/hu';
import * as l10n from '@vscode/l10n';
import { ThemeAdapter } from './ThemeAdapter';
import { pluginInjectOptions } from './plugins';

/**
 * Shared Blockly webview bootstrap used by both browser bundles — the Blocks
 * Editor (`webview/index.ts`) and the Guided Catalog Editor
 * (`webview/catalog-editor/index.ts`). Holds only the generic setup the two
 * editors share verbatim (locale, dialog bridge, themed inject); everything
 * editor-specific (toolboxes, codegen, message protocols, custom fields) stays
 * in each entry point. This module is browser-only and must not import `vscode`.
 */

// Keys are VS Code locale identifiers (vscode.env.language); Chinese maps to
// Blockly's script-based codes (zh-cn → zh-hans, zh-tw → zh-hant).
const BLOCKLY_LOCALES: Record<string, typeof En> = {
    en: En, it: It,
    'zh-cn': ZhHans, 'zh-tw': ZhHant,
    fr: Fr, de: De, es: Es, ja: Ja, ko: Ko, ru: Ru,
    'pt-br': PtBr, tr: Tr, pl: Pl, cs: Cs, hu: Hu,
};

/**
 * Read the host-injected l10n data, configure `@vscode/l10n`, and set the
 * Blockly locale. Must run before any Blockly block definitions or UI. Returns
 * the active VS Code locale identifier for the caller's own l10n-dependent logic.
 */
export function configureBlocklyLocale(): string {
    const l10nDataEl = document.getElementById('l10n-data');
    const l10nLocaleEl = document.getElementById('l10n-locale');
    const l10nContents: Record<string, string> = l10nDataEl ? JSON.parse(l10nDataEl.textContent || '{}') : {};
    const locale: string = l10nLocaleEl ? JSON.parse(l10nLocaleEl.textContent || '"en"') : 'en';

    l10n.config({ contents: l10nContents });
    Blockly.setLocale((BLOCKLY_LOCALES[locale] ?? En) as unknown as { [key: string]: string });
    return locale;
}

/** Minimal view of the VS Code webview API this module needs. */
interface VsCodeApi {
    postMessage(msg: unknown): void;
}

/** Routes Blockly dialog results from the host back to their pending callbacks. */
export interface DialogBridge {
    handleDialogResult(id: number, value: unknown): void;
}

/**
 * Route Blockly's `window.open` and dialog (`prompt`/`confirm`/`alert`) calls
 * through `postMessage`, since VS Code webviews block popups and native dialogs.
 * The host shows native VS Code UI and replies with a `dialog_result` message,
 * which the caller forwards to {@link DialogBridge.handleDialogResult}.
 */
export function installDialogBridge(vscode: VsCodeApi): DialogBridge {
    // Sandbox workaround: VS Code webviews block window.open (no allow-popups).
    // Blockly's showHelp() calls window.open(helpUrl), so route via postMessage.
    const _origWindowOpen = window.open;
    window.open = function (url?: string | URL, ...rest: any[]) {
        if (url) {
            vscode.postMessage({ type: 'open_url', url: String(url) });
            return null;
        }
        return _origWindowOpen.call(window, url, ...rest);
    } as typeof window.open;

    const pendingDialogs = new Map<number, (result: any) => void>();
    let dialogIdCounter = 0;

    Blockly.dialog.setPrompt((message, defaultValue, callback) => {
        const id = dialogIdCounter++;
        pendingDialogs.set(id, callback);
        vscode.postMessage({ type: 'dialog_prompt', id, message, defaultValue });
    });

    Blockly.dialog.setConfirm((message, callback) => {
        const id = dialogIdCounter++;
        pendingDialogs.set(id, callback);
        vscode.postMessage({ type: 'dialog_confirm', id, message });
    });

    Blockly.dialog.setAlert((message, callback) => {
        const id = dialogIdCounter++;
        if (callback) {
            pendingDialogs.set(id, callback);
        }
        vscode.postMessage({ type: 'dialog_alert', id, message });
    });

    return {
        handleDialogResult(id: number, value: unknown): void {
            const cb = pendingDialogs.get(id);
            if (cb) {
                pendingDialogs.delete(id);
                cb(value);
            }
        },
    };
}

/** Result of {@link injectThemedWorkspace}. */
export interface ThemedWorkspace {
    workspace: Blockly.WorkspaceSvg;
    themeAdapter: ThemeAdapter;
}

/**
 * Inject a Blockly workspace with the project's standard options (thrasos
 * renderer, trashcan, scroll/zoom, scroll/connection plugins) and a
 * {@link ThemeAdapter} bound to it. `overrides` is shallow-merged last, so a
 * caller can supply its own `toolbox` (the default is an empty category toolbox
 * populated later). Returns the workspace and its theme adapter.
 */
export function injectThemedWorkspace(
    container: Element,
    overrides: Partial<Blockly.BlocklyOptions> = {},
): ThemedWorkspace {
    const workspace = Blockly.inject(container, {
        renderer: 'thrasos',
        toolbox: { kind: 'categoryToolbox', contents: [] },
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1.0 },
        ...pluginInjectOptions,
        ...overrides,
    });

    const themeAdapter = new ThemeAdapter();
    themeAdapter.init(workspace);
    return { workspace, themeAdapter };
}
