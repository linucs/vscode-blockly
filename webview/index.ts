import * as Blockly from 'blockly';
import * as En from 'blockly/msg/en';
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeDropdown, vsCodeOption } from "@vscode/webview-ui-toolkit";
import { ThemeAdapter, categoryStyleFor } from './ThemeAdapter';
import { CodeFactory } from './codegen/CodeFactory';
import { isRuntimeSupported } from './codegen/generatorRegistry';
import { initTypedVariableModal, initWorkspacePlugins, pluginInjectOptions, CPP_VARIABLE_TYPES, ThemedMinimap } from './plugins';
import { initCppProcedureFlyout } from './custom-blocks/cppProcedureBlocks';

Blockly.setLocale(En);

// Register VSCode UI Toolkit components
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeDropdown(), vsCodeOption());

interface EnvInfo { name: string; platform?: string; board?: string; framework?: string; }

// Acquire VSCode API for messaging
const vscode = acquireVsCodeApi();

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

    initTypedVariableModal(workspace, CPP_VARIABLE_TYPES);
    initWorkspacePlugins(workspace);
    initCppProcedureFlyout(workspace);

    const codeFactory = new CodeFactory();

    const emptyState = document.getElementById('emptyState');
    const emptyTitle = emptyState?.querySelector('.title') as HTMLElement | null;
    const emptyHint = emptyState?.querySelector('.hint') as HTMLElement | null;
    const envSelect = document.getElementById('envSelect') as HTMLElement & { value?: string };
    const envLabel = document.getElementById('envLabel');
    const generateBtn = document.getElementById('generateBtn') as (HTMLElement & { disabled?: boolean }) | null;

    const updateButtonVisibility = () => {
        if (!generateBtn) return;
        if (autoGenerate) {
            generateBtn.style.display = 'none';
        } else {
            generateBtn.style.display = '';
            generateBtn.disabled = !runtimeReady;
        }
    };

    const showGenerationFeedback = (ok: boolean, error?: string) => {
        if (!generateBtn) return;
        if (autoGenerate && ok) return;

        const origText = generateBtn.textContent;
        if (ok) {
            generateBtn.textContent = 'Generated ✓';
        } else {
            generateBtn.textContent = error ? `Error: ${error}` : 'Generation failed';
            if (autoGenerate) {
                generateBtn.style.display = '';
            }
        }
        setTimeout(() => {
            generateBtn!.textContent = origText;
            updateButtonVisibility();
        }, ok ? 1500 : 4000);
    };

    // Show a full-area notice instead of the toolbox (no board / no framework / unsupported runtime).
    const showBlocked = (title: string, hint: string) => {
        if (emptyTitle) emptyTitle.textContent = title;
        if (emptyHint) emptyHint.textContent = hint;
        emptyState?.classList.add('visible');
        runtimeReady = false;
        updateButtonVisibility();
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
            kind: 'category', name: 'Logic', categorystyle: categoryStyleFor('Logic'),
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
            kind: 'category', name: 'Loops', categorystyle: categoryStyleFor('Loops'),
            contents: [
                { kind: 'block', type: 'controls_repeat_ext' },
                { kind: 'block', type: 'controls_whileUntil' },
                { kind: 'block', type: 'controls_for' },
                { kind: 'block', type: 'controls_doWhile' },
                { kind: 'block', type: 'controls_flow_statements' },
            ]
        },
        {
            kind: 'category', name: 'Math', categorystyle: categoryStyleFor('Math'),
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
            kind: 'category', name: 'Text', categorystyle: categoryStyleFor('Text'),
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
            kind: 'category', name: 'Variables', categorystyle: categoryStyleFor('Variables'),
            custom: 'CREATE_TYPED_VARIABLE',
        },
        {
            kind: 'category', name: 'Arrays', categorystyle: categoryStyleFor('Arrays'),
            contents: [
                { kind: 'block', type: 'array_get' },
                { kind: 'block', type: 'array_set' },
            ]
        },
        {
            kind: 'category', name: 'Functions', categorystyle: categoryStyleFor('Functions'),
            custom: 'CPP_PROCEDURE',
        },
        {
            kind: 'category', name: 'Code', categorystyle: categoryStyleFor('Text'),
            contents: [
                { kind: 'block', type: 'code_declaration' },
                { kind: 'block', type: 'code_statement' },
                { kind: 'block', type: 'code_expression' },
            ]
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
            const detail = env.board ? ` (${env.board})` : env.platform ? ` (${env.platform})` : '';
            opt.textContent = env.name + detail;
            envSelect.appendChild(opt);
        }
        if (selected) (envSelect as any).value = selected;
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
                        'No board detected',
                        'Open this file inside a project containing a platformio.ini or sketch.yaml to load the blocks compatible with your board.'
                    );
                    break;
                }
                if (!framework || !runtime) {
                    const isArduino = message.configType === 'arduino';
                    showBlocked(
                        'No framework declared',
                        isArduino
                            ? 'This profile\'s FQBN does not specify a recognized framework. Ensure the fqbn field is set correctly in sketch.yaml.'
                            : 'This environment does not set "framework" in platformio.ini, so no code can be generated. Add a framework (e.g. framework = arduino).'
                    );
                    break;
                }
                if (!isRuntimeSupported(runtime) || !codeFactory.setRuntime(runtime)) {
                    showBlocked(
                        `Framework "${framework}" not yet supported`,
                        `Block generation for the "${runtime}" runtime is not implemented yet. Currently supported: arduino:cpp.`
                    );
                    break;
                }

                // Supported runtime: show the toolbox and enable generation.
                emptyState?.classList.remove('visible');
                runtimeReady = true;
                updateButtonVisibility();

                codeFactory.loadCatalogEntries(message.entries ?? []);

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
                const languageCategories = LANGUAGE_CATEGORIES.map(cat => {
                    const name = (cat as any).name;
                    const match = catalogCategories.find(c => c.name === name && Array.isArray(c.contents));
                    if (!match || !Array.isArray((cat as any).contents)) return cat;
                    merged.add(name);
                    return { ...cat, contents: [...(cat as any).contents, ...match.contents] };
                });
                const standalone = catalogCategories.filter(c => !merged.has(c.name));

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
                updateButtonVisibility();
                break;
            case 'set_category_colors':
                themeAdapter.setCustomColors(message.colors ?? {});
                break;
            case 'theme_changed':
                themeAdapter.onThemeChanged();
                if (minimap) minimap.applyDarkTheme(workspace);
                break;
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

    // Generate C++ from the current workspace, tolerating generator errors.
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

    // Explicit regeneration via button (always sends code).
    generateBtn?.addEventListener('click', () => {
        const state = Blockly.serialization.workspaces.save(workspace);
        lastSentState = JSON.stringify(state);
        vscode.postMessage({ type: 'change', state, code: generate() });
    });
});
