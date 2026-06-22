import * as Blockly from 'blockly';
import { EditorState, type Extension } from '@codemirror/state';
import {
    EditorView, keymap, highlightSpecialChars, drawSelection, lineNumbers,
    MatchDecorator, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';

/**
 * CodeMirror 6 setup for {@link FieldCode}'s editor (Tier-2). Language is derived
 * from the enclosing `implementation` block's `runtime`; `{{NAME}}` template
 * placeholders are highlighted; the theme + token colours are read live from
 * `--vscode-*` CSS variables (best-effort — token-colour vars fall back to the
 * VS Code default-dark palette where a theme doesn't expose them).
 */

export type CodeLang = 'cpp' | 'python';

/** The language after the `:` in a `<framework>:<language>` runtime, when supported. */
export function langForRuntime(runtime: string | null | undefined): CodeLang | null {
    const lang = runtime?.split(':')[1]?.toLowerCase();
    return lang === 'cpp' ? 'cpp' : lang === 'python' ? 'python' : null;
}

/**
 * Walk up the meta-block tree from a `code_snippet`/`helper` block to the enclosing
 * `implementation` and read its `RUNTIME`. Returns null outside the catalog editor
 * (e.g. the runtime webview, where `field_code` sits on a real catalog block) — the
 * editor then opens without a language grammar (plain text).
 */
export function runtimeForBlock(block: Blockly.Block | null): string | null {
    for (let b = block?.getSurroundParent(); b; b = b.getSurroundParent()) {
        if (b.type === 'implementation') {
            return b.getFieldValue('RUNTIME');
        }
    }
    return null;
}

const cssVar = (styles: CSSStyleDeclaration, name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;

/** `{{NAME}}` / `{{NAME.sub}}` placeholders — must match templateEngine's regex. */
const placeholderMatcher = new MatchDecorator({
    regexp: /\{\{(\w+(?:\.\w+)?)\}\}/g,
    decoration: Decoration.mark({ class: 'cm-template-ph' }),
});
const placeholderHighlighter = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
            this.decorations = placeholderMatcher.createDeco(view);
        }
        update(u: ViewUpdate): void {
            this.decorations = placeholderMatcher.updateDeco(u, this.decorations);
        }
    },
    { decorations: v => v.decorations },
);

function vscodeTheme(styles: CSSStyleDeclaration): Extension {
    const fg = cssVar(styles, '--vscode-editor-foreground', '#d4d4d4');
    const font = cssVar(styles, '--vscode-editor-fontFamily', '"Courier New", monospace');
    const fontSize = cssVar(styles, '--vscode-editor-fontSize', '13px');
    const selection = cssVar(styles, '--vscode-editor-selectionBackground', '#264f78');
    const caret = cssVar(styles, '--vscode-editorCursor-foreground', fg);
    const ph = cssVar(styles, '--vscode-textLink-foreground', '#4daafc');
    return EditorView.theme({
        '&': { color: fg, backgroundColor: 'transparent', fontSize },
        '.cm-content': { fontFamily: font, caretColor: caret },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: caret },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: selection },
        '.cm-gutters': { backgroundColor: 'transparent', color: cssVar(styles, '--vscode-editorLineNumber-foreground', '#858585'), border: 'none' },
        '.cm-template-ph': { color: ph, fontWeight: '600' },
        '&.cm-editor.cm-focused': { outline: 'none' },
    }, { dark: true });
}

function vscodeHighlight(styles: CSSStyleDeclaration): Extension {
    const keyword = cssVar(styles, '--vscode-symbolIcon-keywordForeground', '#569CD6');
    const string = cssVar(styles, '--vscode-symbolIcon-stringForeground', '#CE9178');
    const number = cssVar(styles, '--vscode-symbolIcon-numberForeground', '#B5CEA8');
    const fn = cssVar(styles, '--vscode-symbolIcon-functionForeground', '#DCDCAA');
    const type = cssVar(styles, '--vscode-symbolIcon-classForeground', '#4EC9B0');
    const comment = cssVar(styles, '--vscode-editorLineNumber-foreground', '#6A9955');
    const style = HighlightStyle.define([
        { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: keyword },
        { tag: [t.string, t.special(t.string)], color: string },
        { tag: [t.number, t.bool, t.null], color: number },
        { tag: [t.function(t.variableName), t.function(t.propertyName)], color: fn },
        { tag: [t.typeName, t.className, t.namespace], color: type },
        { tag: [t.comment, t.lineComment, t.blockComment], color: comment, fontStyle: 'italic' },
        { tag: [t.meta], color: keyword },
    ]);
    return syntaxHighlighting(style);
}

export interface CodeEditorOptions {
    parent: HTMLElement;
    doc: string;
    lang: CodeLang | null;
    /** Submit (Cmd/Ctrl+Enter or Escape handled by the caller). */
    onEscape: () => void;
}

/** Build and mount a CodeMirror editor; the caller reads `view.state.doc` on close. */
export function createCodeEditor(opts: CodeEditorOptions): EditorView {
    const styles = getComputedStyle(document.body);
    const langExt: Extension[] = opts.lang === 'cpp' ? [cpp()] : opts.lang === 'python' ? [python()] : [];
    return new EditorView({
        parent: opts.parent,
        state: EditorState.create({
            doc: opts.doc,
            extensions: [
                lineNumbers(),
                highlightSpecialChars(),
                history(),
                drawSelection(),
                indentOnInput(),
                bracketMatching(),
                ...langExt,
                placeholderHighlighter,
                vscodeHighlight(styles),
                vscodeTheme(styles),
                keymap.of([
                    { key: 'Escape', run: () => { opts.onEscape(); return true; } },
                    indentWithTab,
                    ...defaultKeymap,
                    ...historyKeymap,
                ]),
                EditorView.lineWrapping,
            ],
        }),
    });
}
