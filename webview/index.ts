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
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeDropdown, vsCodeOption } from "@vscode/webview-ui-toolkit";
import { ThemeAdapter, categoryStyleFor } from './ThemeAdapter';
import { CodeFactory } from './codegen/core/CodeFactory';
import { isRuntimeSupported } from './codegen/core/generatorRegistry';
import { setCommentAnnotation } from './codegen/core/commentAnnotation';
import { initTypedVariableModal, initWorkspacePlugins, pluginInjectOptions, CPP_VARIABLE_TYPES, ThemedMinimap } from './plugins';
import { initCppProcedureFlyout } from './custom-blocks/cppProcedureBlocks';
// Registers the `hat_event_style` block extension as a side effect, so catalog
// blocks referencing it (e.g. hat-style attachInterrupt) define without throwing.
import './custom-blocks/hatEventStyle';
// Registers the `field_param_input` field as a side effect, so arduino:python
// callback-parameter blocks define without throwing regardless of active runtime.
import './custom-fields/FieldParamInput';

// ── i18n bootstrap (must happen before any Blockly block defs or UI) ───────
const l10nDataEl = document.getElementById('l10n-data');
const l10nLocaleEl = document.getElementById('l10n-locale');
const l10nContents: Record<string, string> = l10nDataEl ? JSON.parse(l10nDataEl.textContent || '{}') : {};
const locale: string = l10nLocaleEl ? JSON.parse(l10nLocaleEl.textContent || '"en"') : 'en';

l10n.config({ contents: l10nContents });

// Keys are VS Code locale identifiers (vscode.env.language); Chinese maps to
// Blockly's script-based codes (zh-cn → zh-hans, zh-tw → zh-hant).
const BLOCKLY_LOCALES: Record<string, typeof En> = {
    en: En, it: It,
    'zh-cn': ZhHans, 'zh-tw': ZhHant,
    fr: Fr, de: De, es: Es, ja: Ja, ko: Ko, ru: Ru,
    'pt-br': PtBr, tr: Tr, pl: Pl, cs: Cs, hu: Hu,
};
Blockly.setLocale((BLOCKLY_LOCALES[locale] ?? En) as unknown as { [key: string]: string });

// Register VSCode UI Toolkit components
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeDropdown(), vsCodeOption());

interface EnvInfo { name: string; platform?: string; board?: string; framework?: string; }
interface DocLink { label: string; url: string }
interface DocGroup { title: string; links: DocLink[] }

let catalogDocs: DocGroup[] = [];

function titleCase(s: string): string {
    return s.replace(/(^|[-_ ])(\w)/g, (_, sep, c) =>
        (sep === '-' || sep === '_' ? ' ' : sep) + c.toUpperCase());
}

// Acquire VSCode API for messaging
const vscode = acquireVsCodeApi();

// ── Sandbox workaround: redirect window.open to extension host ─────────────
// VS Code webviews block window.open (no allow-popups). Blockly's showHelp()
// calls window.open(helpUrl), so we intercept and route via postMessage.
const _origWindowOpen = window.open;
window.open = function (url?: string | URL, ...rest: any[]) {
    if (url) {
        vscode.postMessage({ type: 'open_url', url: String(url) });
        return null;
    }
    return _origWindowOpen.call(window, url, ...rest);
} as typeof window.open;

// ── Blockly dialog overrides ────────────────────────────────────────────────
// VS Code webviews do not support window.prompt / window.confirm / window.alert.
// Override Blockly's dialog functions to round-trip through postMessage so the
// extension host can show native VS Code UI (InputBox, QuickPick, etc.).
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
    if (callback) pendingDialogs.set(id, callback);
    vscode.postMessage({ type: 'dialog_alert', id, message });
});

document.addEventListener("DOMContentLoaded", () => {
    const blocklyDiv = document.getElementById('blocklyDiv');
    if (!blocklyDiv) {
        console.error("blocklyDiv not found");
        return;
    }

    const workspace = Blockly.inject(blocklyDiv, {
        // Start with an empty category toolbox; it's populated dynamically once
        // the board context arrives. (Injecting without one would make later
        // updateToolbox() calls fail.)
        renderer: 'thrasos',
        toolbox: { kind: 'categoryToolbox', contents: [] },
        trashcan: true,
        move: { scrollbars: true, drag: true, wheel: true },
        zoom: { controls: true, wheel: true, startScale: 1.0 },
        ...pluginInjectOptions,
    });

    const themeAdapter = new ThemeAdapter();
    themeAdapter.init(workspace);

    // Load block message dictionaries from JSON (injected by the host).
    // Must happen BEFORE plugin init: typed-variable-modal pre-renders its
    // DOM at init() time reading from Blockly.Msg, so the translations must
    // already be present. We also pass them explicitly via the plugin's
    // optMessages constructor parameter (its designed i18n API).
    const blockMsgEnEl = document.getElementById('block-messages-en');
    const blockMsgLocaleEl = document.getElementById('block-messages-locale');
    const blockMsgEn: Record<string, string> = blockMsgEnEl ? JSON.parse(blockMsgEnEl.textContent || '{}') : {};
    const blockMsgLocale: Record<string, string> = blockMsgLocaleEl ? JSON.parse(blockMsgLocaleEl.textContent || '{}') : {};
    Object.assign(Blockly.Msg, blockMsgEn);
    Object.assign(Blockly.Msg, blockMsgLocale);

    const mergedBlockMessages = { ...blockMsgEn, ...blockMsgLocale };
    initTypedVariableModal(workspace, CPP_VARIABLE_TYPES, mergedBlockMessages);
    initWorkspacePlugins(workspace);
    initCppProcedureFlyout(workspace);

    const translateCategory = (key: string): string => {
        const CATEGORY_NAMES: Record<string, () => string> = {
            'Logic': () => l10n.t('Logic'),
            'Loops': () => l10n.t('Loops'),
            'Math': () => l10n.t('Math'),
            'Text': () => l10n.t('Text'),
            'Variables': () => l10n.t('Variables'),
            'Arrays': () => l10n.t('Arrays'),
            'Lists': () => l10n.t('Lists'),
            'Functions': () => l10n.t('Functions'),
            'Code': () => l10n.t('Code'),
        };
        return CATEGORY_NAMES[key]?.() ?? key;
    };

    const codeFactory = new CodeFactory();
    codeFactory.setCategoryTranslator(translateCategory);

    const emptyState = document.getElementById('emptyState');
    const emptyTitle = emptyState?.querySelector('.title') as HTMLElement | null;
    const emptyHint = emptyState?.querySelector('.hint') as HTMLElement | null;
    const envSelect = document.getElementById('envSelect') as HTMLElement & { value?: string };
    const envLabel = document.getElementById('envLabel');
    const generateBtn = document.getElementById('generateBtn') as (HTMLElement & { disabled?: boolean; appearance?: string }) | null;
    const genCaret = document.getElementById('genCaret');
    const genMenu = document.getElementById('genMenu') as HTMLElement | null;
    const autoGenCheck = document.getElementById('autoGenCheck') as HTMLInputElement | null;
    const docsBtn = document.getElementById('docsBtn');

    // Reference docs are contextual to the loaded catalog: actionable with a count when
    // present, dimmed (aria-disabled) with an explanatory tooltip when blocks expose none.
    // Tooltip text is driven through data-tooltip (see the custom tooltip handler below).
    const updateDocsButton = () => {
        if (!docsBtn) return;
        const n = catalogDocs.length;
        docsBtn.setAttribute('aria-disabled', n === 0 ? 'true' : 'false');
        const tip = n === 0
            ? l10n.t('No reference documentation for the current blocks')
            : n === 1
                ? l10n.t('Open reference documentation (1 component)')
                : l10n.t('Open reference documentation ({0} components)', String(n));
        docsBtn.setAttribute('aria-label', tip);
        docsBtn.setAttribute('data-tooltip', tip);
    };

    // Custom tooltip for toolbar controls. Native `title`/SVG <title> are unreliable
    // through the toolkit's shadow DOM and don't cover the whole control; this single
    // delegated handler reads `data-tooltip` and works for every toolbar button.
    // Event retargeting at the shadow boundary means ev.target resolves to the host
    // <vscode-button>, so closest('[data-tooltip]') finds the attribute regardless.
    const tooltipEl = document.createElement('div');
    tooltipEl.id = 'tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);

    let tooltipTarget: Element | null = null;
    let tooltipTimer = 0;

    const hideTooltip = () => {
        if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = 0; }
        tooltipEl.classList.remove('visible');
        tooltipTarget = null;
    };

    const placeTooltip = (target: Element) => {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;
        tooltipEl.textContent = text;
        tooltipEl.classList.add('visible');
        const r = target.getBoundingClientRect();
        const t = tooltipEl.getBoundingClientRect();
        let left = r.left + r.width / 2 - t.width / 2;
        left = Math.max(4, Math.min(left, window.innerWidth - t.width - 4));
        let top = r.bottom + 4;
        if (top + t.height > window.innerHeight - 4) top = r.top - t.height - 4;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    document.addEventListener('mouseover', (ev) => {
        const target = (ev.target as Element | null)?.closest('[data-tooltip]') ?? null;
        if (!target || target === tooltipTarget) return;
        hideTooltip();
        tooltipTarget = target;
        tooltipTimer = window.setTimeout(() => {
            if (tooltipTarget === target) placeTooltip(target);
        }, 500);
    });
    document.addEventListener('mouseout', (ev) => {
        if (!tooltipTarget) return;
        // Ignore moves that stay within the same control (child/shadow transitions);
        // relatedTarget is retargeted to the host at the shadow boundary.
        const related = ev.relatedTarget as Node | null;
        if (related && tooltipTarget.contains(related)) return;
        hideTooltip();
    });
    document.addEventListener('mousedown', hideTooltip);

    // The split control is always visible: the body always generates on demand,
    // the caret menu toggles auto mode. In auto mode the body is de-emphasized.
    const updateGenControl = () => {
        if (autoGenCheck) autoGenCheck.checked = autoGenerate;
        if (!generateBtn) return;
        generateBtn.disabled = !runtimeReady;
        generateBtn.appearance = autoGenerate ? 'secondary' : 'primary';
        generateBtn.setAttribute('data-tooltip', autoGenerate
            ? l10n.t('Regenerate code now (auto-generation is on)')
            : l10n.t('Generate code now'));
    };

    const closeGenMenu = () => { if (genMenu) genMenu.hidden = true; };

    const showGenerationFeedback = (ok: boolean, error?: string) => {
        if (!generateBtn) return;
        // In auto mode generation runs on every change — don't flash success each time.
        if (autoGenerate && ok) return;

        const origText = generateBtn.textContent;
        if (ok) {
            generateBtn.textContent = l10n.t('Generated ✓');
        } else {
            generateBtn.textContent = error ? l10n.t('Error: {0}', error) : l10n.t('Generation failed');
        }
        setTimeout(() => {
            generateBtn!.textContent = origText;
            updateGenControl();
        }, ok ? 1500 : 4000);
    };

    // Show a full-area notice instead of the toolbox (no board / no framework / unsupported runtime).
    const showBlocked = (title: string, hint: string) => {
        if (emptyTitle) emptyTitle.textContent = title;
        if (emptyHint) emptyHint.textContent = hint;
        emptyState?.classList.add('visible');
        runtimeReady = false;
        updateGenControl();
        workspace.updateToolbox({ kind: 'categoryToolbox', contents: [] });
    };

    let autoGenerate = true;
    let runtimeReady = false;
    let minimap: ThemedMinimap | null = null;

    let suppressEnvEvent = false;
    if (envSelect) {
        envSelect.addEventListener('change', () => {
            if (suppressEnvEvent) return;
            const env = (envSelect as any).value as string;
            if (env) vscode.postMessage({ type: 'select_env', env });
        });
    }

    const LANGUAGE_CATEGORIES = [
        {
            kind: 'category', _key: 'Logic', name: translateCategory('Logic'), categorystyle: categoryStyleFor('Logic'),
            contents: [
                { kind: 'block', type: 'controls_if' },
                { kind: 'block', type: 'controls_switch_case' },
                { kind: 'block', type: 'logic_compare' },
                { kind: 'block', type: 'logic_operation' },
                { kind: 'block', type: 'logic_negate' },
                { kind: 'block', type: 'logic_boolean' },
                { kind: 'block', type: 'logic_ternary' },
            ]
        },
        {
            kind: 'category', _key: 'Loops', name: translateCategory('Loops'), categorystyle: categoryStyleFor('Loops'),
            contents: [
                { kind: 'block', type: 'controls_repeat_ext' },
                { kind: 'block', type: 'controls_whileUntil' },
                { kind: 'block', type: 'controls_for' },
                { kind: 'block', type: 'controls_doWhile' },
                { kind: 'block', type: 'controls_flow_statements' },
            ]
        },
        {
            kind: 'category', _key: 'Math', name: translateCategory('Math'), categorystyle: categoryStyleFor('Math'),
            contents: [
                { kind: 'block', type: 'math_number' },
                { kind: 'block', type: 'math_arithmetic' },
                { kind: 'block', type: 'math_modulo' },
                { kind: 'block', type: 'math_single' },
                { kind: 'block', type: 'math_trig' },
                { kind: 'block', type: 'math_constant' },
                { kind: 'block', type: 'math_round' },
                { kind: 'block', type: 'math_number_property' },
                { kind: 'block', type: 'bitwise_operation' },
                { kind: 'block', type: 'bitwise_not' },
                { kind: 'block', type: 'type_cast' },
            ]
        },
        {
            kind: 'category', _key: 'Text', name: translateCategory('Text'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'text' },
                { kind: 'block', type: 'symbol_literal' },
                { kind: 'block', type: 'text_join' },
                { kind: 'block', type: 'text_append' },
                { kind: 'block', type: 'text_length' },
                { kind: 'block', type: 'text_isEmpty' },
                { kind: 'block', type: 'text_indexOf' },
                { kind: 'block', type: 'text_charAt' },
                { kind: 'block', type: 'text_getSubstring' },
                { kind: 'block', type: 'text_changeCase' },
                { kind: 'block', type: 'text_trim' },
            ]
        },
        {
            kind: 'category', _key: 'Variables', name: translateCategory('Variables'), categorystyle: categoryStyleFor('Variables'),
            custom: 'CREATE_TYPED_VARIABLE',
        },
        {
            kind: 'category', _key: 'Arrays', name: translateCategory('Arrays'), categorystyle: categoryStyleFor('Arrays'),
            contents: [
                { kind: 'block', type: 'array_get' },
                { kind: 'block', type: 'array_set' },
            ]
        },
        {
            kind: 'category', _key: 'Functions', name: translateCategory('Functions'), categorystyle: categoryStyleFor('Functions'),
            custom: 'CPP_PROCEDURE',
        },
        {
            kind: 'category', _key: 'Code', name: translateCategory('Code'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'code_declaration' },
                { kind: 'block', type: 'code_statement' },
                { kind: 'block', type: 'code_expression' },
            ]
        },
    ];

    // Toolbox for the `arduino:python` runtime. Uses Blockly's stock Python L1
    // blocks (Lists instead of C++ Arrays, no do-while, text_print) and the
    // built-in VARIABLE/PROCEDURE flyouts (Python procedures are stock Blockly,
    // not the typed C++ ones). The shared `controls_switch_case` block is reused
    // (its Python generator emits match/case). The `code_*` family is merged in
    // from the arduino:python catalog (catalogs/arduino/python/code.yaml) via the
    // name-matched "Code" category below.
    const PYTHON_LANGUAGE_CATEGORIES = [
        {
            kind: 'category', _key: 'Logic', name: translateCategory('Logic'), categorystyle: categoryStyleFor('Logic'),
            contents: [
                { kind: 'block', type: 'controls_if' },
                { kind: 'block', type: 'controls_switch_case' },
                { kind: 'block', type: 'logic_compare' },
                { kind: 'block', type: 'logic_operation' },
                { kind: 'block', type: 'logic_negate' },
                { kind: 'block', type: 'logic_boolean' },
                { kind: 'block', type: 'logic_null' },
                { kind: 'block', type: 'logic_ternary' },
            ]
        },
        {
            kind: 'category', _key: 'Loops', name: translateCategory('Loops'), categorystyle: categoryStyleFor('Loops'),
            contents: [
                { kind: 'block', type: 'controls_repeat_ext' },
                { kind: 'block', type: 'controls_whileUntil' },
                { kind: 'block', type: 'controls_for' },
                { kind: 'block', type: 'controls_flow_statements' },
            ]
        },
        {
            kind: 'category', _key: 'Math', name: translateCategory('Math'), categorystyle: categoryStyleFor('Math'),
            contents: [
                { kind: 'block', type: 'math_number' },
                { kind: 'block', type: 'math_arithmetic' },
                { kind: 'block', type: 'math_single' },
                { kind: 'block', type: 'math_trig' },
                { kind: 'block', type: 'math_constant' },
                { kind: 'block', type: 'math_round' },
                { kind: 'block', type: 'math_modulo' },
                { kind: 'block', type: 'math_constrain' },
                { kind: 'block', type: 'math_random_int' },
                { kind: 'block', type: 'math_random_float' },
                { kind: 'block', type: 'math_number_property' },
            ]
        },
        {
            kind: 'category', _key: 'Text', name: translateCategory('Text'), categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'text' },
                { kind: 'block', type: 'text_join' },
                { kind: 'block', type: 'text_length' },
                { kind: 'block', type: 'text_isEmpty' },
                { kind: 'block', type: 'text_indexOf' },
                { kind: 'block', type: 'text_charAt' },
                { kind: 'block', type: 'text_getSubstring' },
                { kind: 'block', type: 'text_changeCase' },
                { kind: 'block', type: 'text_trim' },
                { kind: 'block', type: 'text_print' },
            ]
        },
        {
            kind: 'category', _key: 'Lists', name: translateCategory('Lists'), categorystyle: categoryStyleFor('Arrays'),
            contents: [
                { kind: 'block', type: 'lists_create_with' },
                { kind: 'block', type: 'lists_repeat' },
                { kind: 'block', type: 'lists_length' },
                { kind: 'block', type: 'lists_isEmpty' },
                { kind: 'block', type: 'lists_indexOf' },
                { kind: 'block', type: 'lists_getIndex' },
                { kind: 'block', type: 'lists_setIndex' },
            ]
        },
        {
            kind: 'category', _key: 'Variables', name: translateCategory('Variables'), categorystyle: categoryStyleFor('Variables'),
            custom: 'VARIABLE',
        },
        {
            kind: 'category', _key: 'Functions', name: translateCategory('Functions'), categorystyle: categoryStyleFor('Functions'),
            custom: 'PROCEDURE',
        },
        {
            // Empty contents: filled by the arduino:python catalog's Code family
            // through the name-matched category merge in init_catalog.
            kind: 'category', _key: 'Code', name: translateCategory('Code'), categorystyle: categoryStyleFor('Text'),
            contents: [] as Array<{ kind: string; type: string }>,
        },
    ];

    function populateEnvSelector(envs: EnvInfo[], selected?: string) {
        if (!envSelect || !envLabel) return;
        const show = envs.length > 0;
        envSelect.style.display = show ? '' : 'none';
        envLabel.style.display = show ? '' : 'none';
        if (!show) return;

        suppressEnvEvent = true;
        envSelect.innerHTML = '';
        for (const env of envs) {
            const opt = document.createElement('vscode-option');
            opt.setAttribute('value', env.name);
            const label = env.name || l10n.t('Default');
            const detail = env.board ? ` (${env.board})` : env.platform ? ` (${env.platform})` : '';
            opt.textContent = label + detail;
            envSelect.appendChild(opt);
        }
        if (selected !== undefined) (envSelect as any).value = selected;
        suppressEnvEvent = false;
    }

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });

    let lastSentState = '';

    // Listen for messages from the extension host
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'init_catalog': {
                const { hasBoard, framework, runtime } = message;
                populateEnvSelector(message.envs ?? [], message.selectedEnv);

                if (!hasBoard) {
                    showBlocked(
                        l10n.t('No board detected'),
                        l10n.t('Open this file inside a project containing a platformio.ini, sketch.yaml, or app.yaml to load the blocks compatible with your board.')
                    );
                    break;
                }
                if (!framework || !runtime) {
                    const isArduino = message.configType === 'arduino';
                    showBlocked(
                        l10n.t('No framework declared'),
                        isArduino
                            ? l10n.t('This profile\'s FQBN does not specify a recognized framework. Ensure the fqbn field is set correctly in sketch.yaml.')
                            : l10n.t('This environment does not set "framework" in platformio.ini, so no code can be generated. Add a framework (e.g. framework = arduino).')
                    );
                    break;
                }
                if (!isRuntimeSupported(runtime) || !codeFactory.setRuntime(runtime)) {
                    showBlocked(
                        l10n.t('Framework "{0}" not yet supported', framework),
                        l10n.t('Block generation for the "{0}" runtime is not implemented yet. Currently supported: arduino:cpp, arduino:python.', runtime)
                    );
                    break;
                }

                // The raw-code field title is language-specific. The block is
                // shared across runtimes, so drop the "(C++)" suffix when the
                // active runtime is not C++.
                if (runtime !== 'arduino:cpp' && Blockly.Msg['FIELD_CODE_TITLE']) {
                    Blockly.Msg['FIELD_CODE_TITLE'] = Blockly.Msg['FIELD_CODE_TITLE'].replace(/\s*\(C\+\+\)\s*$/, '');
                }

                // Supported runtime: show the toolbox and enable generation.
                emptyState?.classList.remove('visible');
                runtimeReady = true;
                updateGenControl();

                codeFactory.loadCatalogEntries(message.entries ?? [], locale);

                catalogDocs = [];
                for (const entry of (message.entries ?? [])) {
                    if (!entry.docs || Object.keys(entry.docs).length === 0) continue;
                    const desc = entry.description;
                    const title = typeof desc === 'object' && desc !== null
                        ? ((desc as Record<string, string>)[locale] ?? (desc as Record<string, string>)['en'] ?? titleCase(entry.id))
                        : (typeof desc === 'string' ? desc : titleCase(entry.id));
                    catalogDocs.push({
                        title,
                        links: Object.entries(entry.docs as Record<string, string>).map(([key, url]) => ({
                            label: titleCase(key), url
                        })),
                    });
                }
                updateDocsButton();

                // Merge catalog categories into language categories that share a
                // name (e.g. a catalog "Code" folds into the built-in "Code"
                // instead of rendering a duplicate). Catalog categories with no
                // language match are appended standalone.
                // loadCatalogEntries registers catalog category labels
                // with ThemeAdapter (via ensureCategoryRegistered), so a
                // single applyTheme rebuilds all style keys before the
                // toolbox references them.
                themeAdapter.applyTheme();

                const catalogCategories = codeFactory.getCatalogToolboxCategories();
                const merged = new Set<string>();
                const baseCategories = runtime === 'arduino:python' ? PYTHON_LANGUAGE_CATEGORIES : LANGUAGE_CATEGORIES;
                const languageCategories = baseCategories.map(cat => {
                    const key = (cat as any)._key as string;
                    const match = catalogCategories.find(c => c._key === key && Array.isArray(c.contents));
                    if (!match || !Array.isArray((cat as any).contents)) return cat;
                    merged.add(key);
                    return { ...cat, contents: [...(cat as any).contents, ...match.contents] };
                });
                const standalone = catalogCategories.filter(c => !merged.has(c._key));

                workspace.updateToolbox({
                    kind: 'categoryToolbox',
                    contents: [
                        { kind: 'search' },
                        ...languageCategories,
                        ...standalone,
                    ]
                });

                break;
            }
            case 'set_mode':
                autoGenerate = message.autoGenerate !== false;
                updateGenControl();
                break;
            case 'theme_changed':
                themeAdapter.onThemeChanged();
                if (minimap) minimap.applyDarkTheme(workspace);
                break;
            case 'set_annotate': {
                const changed = setCommentAnnotation(message.annotate !== false);
                // Re-emit so the source reflects the new setting, but only when the
                // value actually changed (not on the initial push at open) and only
                // when auto-generation is on, mirroring the change listener.
                if (changed && autoGenerate && runtimeReady) generateNow();
                break;
            }
            case 'set_minimap':
                if (message.show && !minimap) {
                    minimap = new ThemedMinimap(workspace);
                    minimap.init();
                    minimap.applyDarkTheme(workspace);
                } else if (!message.show && minimap) {
                    minimap.dispose();
                    minimap = null;
                }
                break;
            case 'generation_result':
                showGenerationFeedback(message.ok, message.error);
                break;
            case 'dialog_result': {
                const cb = pendingDialogs.get(message.id);
                if (cb) {
                    pendingDialogs.delete(message.id);
                    cb(message.value);
                }
                break;
            }
            case 'update':
                // Update workspace from XML/JSON
                if (message.state) {
                    const incomingState = JSON.stringify(message.state);
                    if (incomingState === lastSentState) {
                        return; // Ignore updates that we just sent
                    }
                    Blockly.Events.disable();
                    try {
                        workspace.clear();
                        Blockly.serialization.workspaces.load(message.state, workspace);
                    } catch (err) {
                        const text = err instanceof Error ? err.message : String(err);
                        console.error('[blocks] Failed to load workspace:', text);
                        vscode.postMessage({ type: 'load_error', error: text });
                    } finally {
                        Blockly.Events.enable();
                    }
                }
                break;
        }
    });

    // Generate code from the current workspace, tolerating generator errors.
    const generate = (): string => {
        try {
            return codeFactory.generateCode(workspace);
        } catch (err) {
            console.error('[codegen] generation failed', err);
            return '';
        }
    };

    // Send block state + generated code to the host on workspace changes.
    workspace.addChangeListener((e) => {
        if (e.isUiEvent) return;
        if (workspace.isDragging()) return;

        const state = Blockly.serialization.workspaces.save(workspace);
        const stateStr = JSON.stringify(state);

        if (stateStr !== lastSentState) {
            lastSentState = stateStr;
            const msg: any = { type: 'change', state };
            if (autoGenerate) msg.code = generate();
            vscode.postMessage(msg);
        }
    });

    // Explicit regeneration via the split-button body (always sends code).
    const generateNow = () => {
        const state = Blockly.serialization.workspaces.save(workspace);
        lastSentState = JSON.stringify(state);
        vscode.postMessage({ type: 'change', state, code: generate() });
    };
    generateBtn?.addEventListener('click', generateNow);

    // Caret opens the one-item options menu.
    genCaret?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (genMenu) genMenu.hidden = !genMenu.hidden;
    });

    // Toggling auto mode persists the global setting (host echoes set_mode back).
    autoGenCheck?.addEventListener('change', () => {
        const enabled = !!autoGenCheck.checked;
        autoGenerate = enabled;
        vscode.postMessage({ type: 'set_generate_mode', autoGenerate: enabled });
        closeGenMenu();
        updateGenControl();
        // Switching back to auto: regenerate now so the file matches current blocks.
        if (enabled && runtimeReady) generateNow();
    });

    // Dismiss the menu on outside click or Escape.
    document.addEventListener('click', (ev) => {
        if (!genMenu || genMenu.hidden) return;
        const target = ev.target as Node;
        if (genMenu.contains(target) || genCaret?.contains(target)) return;
        closeGenMenu();
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') closeGenMenu();
    });

    docsBtn?.addEventListener('click', () => {
        if (catalogDocs.length > 0) {
            vscode.postMessage({ type: 'show_docs', docs: catalogDocs });
        }
    });
});
