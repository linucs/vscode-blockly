import { i18nFromEntries, isI18nMap, type I18nText } from '../../../src/catalog/serialize/i18n';
import { LOCALE_CODES, localeDisplayName } from './locales';

/**
 * The in-webview translation dialog (design D6.4) — chrome, not a meta-block.
 * A native DOM overlay (`--vscode-*` styled, no new dependency, no host round-trip)
 * that edits the full locale map of a translatable value (`message_row` text,
 * `block_def` tooltip, `catalog` description).
 *
 * UX (pinned): the first row is the **primary** (translation source + first key in
 * the YAML map, shown with a ⭐ pill and pinnable via "make primary"); the
 * "add language" dropdown lists all locales (pre-selected to the VS Code locale)
 * and appends an empty row; a single language always collapses to a scalar string
 * ({@link i18nFromEntries}); each non-primary row offers a best-effort 🔄 translate
 * from a chosen source when an LLM provider is available.
 *
 * English strings are hardcoded; catalog-editor i18n lands in M8.
 */

/** Translate `text` from→to via the host's `vscode.lm`; rejects when unavailable. */
type TranslateFn = (text: string, from: string, to: string) => Promise<string>;

let dialogLocale = 'en';
let translateFn: TranslateFn | undefined;

/** Wire the editor's current locale + (optional) translate channel into the dialog. */
export function configureTranslation(opts: { locale: string; translate?: TranslateFn }): void {
    dialogLocale = opts.locale || 'en';
    translateFn = opts.translate;
}

interface Row {
    locale: string;
    text: string;
}

/** Build the dialog's editable rows from the stored value (scalar → one row). */
function rowsFromValue(value: I18nText | undefined): Row[] {
    if (isI18nMap(value)) {
        return Object.entries(value).map(([locale, text]) => ({ locale, text }));
    }
    // A scalar (or empty) has no language tag: seed one row at the editor locale.
    return [{ locale: dialogLocale, text: typeof value === 'string' ? value : '' }];
}

function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(el.style, styles);
}

/**
 * Inject the dialog's `:focus` rule once. Inline styles can't express `:focus`, so
 * a focused field would otherwise show the browser's default (theme-agnostic) focus
 * ring; drive the focused border from `--vscode-focusBorder` instead (matching the
 * FieldCombobox custom field and native VS Code inputs). `!important` beats the
 * inline border.
 */
function ensureDialogStyles(): void {
    if (document.getElementById('ce-i18n-dialog-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'ce-i18n-dialog-styles';
    style.textContent =
        '.ce-i18n-focusable:focus { outline: none !important; ' +
        'border-color: var(--vscode-focusBorder, #007fd4) !important; }' +
        // Keyboard focus on the dialog's buttons (no border to colour) → themed outline.
        '.ce-i18n-dialog button:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); ' +
        'outline-offset: 1px; }';
    document.head.appendChild(style);
}

/** Theme a native <select> with VS Code dropdown tokens (closed control + option list). */
function styleSelect(el: HTMLSelectElement): void {
    el.classList.add('ce-i18n-focusable');
    css(el, {
        fontSize: '12px', padding: '3px 6px', borderRadius: '2px',
        color: 'var(--vscode-dropdown-foreground, var(--vscode-foreground, #ccc))',
        background: 'var(--vscode-dropdown-background, #3c3c3c)',
        border: '1px solid var(--vscode-dropdown-border, var(--vscode-editorWidget-border, #555))',
    });
}

/**
 * Open the translation dialog for `current`, calling `onApply` with the next
 * {@link I18nText} (a scalar when one locale remains, an ordered map otherwise).
 */
export function openTranslationDialog(current: I18nText | undefined, onApply: (next: I18nText) => void): void {
    ensureDialogStyles();
    let rows = rowsFromValue(current);

    const backdrop = document.createElement('div');
    css(backdrop, {
        position: 'fixed', inset: '0', zIndex: '1000', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
    });

    const modal = document.createElement('div');
    modal.className = 'ce-i18n-dialog';
    css(modal, {
        minWidth: '460px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
        padding: '16px', borderRadius: '4px',
        font: 'var(--vscode-font-family, sans-serif)',
        color: 'var(--vscode-foreground, #ccc)',
        background: 'var(--vscode-editorWidget-background, #252526)',
        border: '1px solid var(--vscode-editorWidget-border, #454545)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    });
    backdrop.appendChild(modal);

    const title = document.createElement('div');
    title.textContent = 'Translations';
    css(title, { fontSize: '13px', fontWeight: '600', marginBottom: '10px' });
    modal.appendChild(title);

    const rowsEl = document.createElement('div');
    modal.appendChild(rowsEl);

    const status = document.createElement('div');
    css(status, { fontSize: '11px', minHeight: '14px', opacity: '0.8', margin: '6px 0' });
    modal.appendChild(status);

    const close = (): void => backdrop.remove();

    function renderRows(): void {
        rowsEl.replaceChildren();
        rows.forEach((row, index) => rowsEl.appendChild(rowEl(row, index)));
        renderAddRow();
    }

    function rowEl(row: Row, index: number): HTMLElement {
        const isPrimary = index === 0;
        const wrap = document.createElement('div');
        css(wrap, { display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0', padding: '2px 4px', borderRadius: '3px' });
        if (isPrimary) {
            // Mark the primary (translation-source) row the way the sibling repos
            // flag an active/preferred item in a webview list (arduino-app-blocks
            // `.file-item.active`): selection background + bold, no emoji/colour.
            css(wrap, { background: 'var(--vscode-editor-selectionBackground, rgba(255,255,255,0.12))' });
        }

        const label = document.createElement('span');
        label.textContent = localeDisplayName(row.locale);
        css(label, { width: '130px', fontSize: '12px', flex: '0 0 auto', fontWeight: isPrimary ? '600' : 'normal' });
        label.title = isPrimary ? `Primary (${row.locale}) · translation source` : row.locale;
        wrap.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ce-i18n-focusable';
        input.value = row.text;
        css(input, {
            flex: '1 1 auto', fontSize: '12px', padding: '3px 6px',
            color: 'var(--vscode-input-foreground, #ccc)',
            background: 'var(--vscode-input-background, #3c3c3c)',
            border: '1px solid var(--vscode-input-border, #555)', borderRadius: '2px',
        });
        input.addEventListener('input', () => { row.text = input.value; });
        wrap.appendChild(input);

        if (!isPrimary && translateFn) {
            wrap.appendChild(translateButton(row, input));
        }
        if (!isPrimary) {
            wrap.appendChild(iconBtn('⤴', 'Make primary (move to first / YAML map order)', () => {
                rows = [row, ...rows.filter(r => r !== row)];
                renderRows();
            }));
            wrap.appendChild(iconBtn('✕', 'Remove this language', () => {
                rows = rows.filter(r => r !== row);
                renderRows();
            }));
        }
        return wrap;
    }

    /** The ✨ AI-translate button: always translates this row from the primary (first) row. */
    function translateButton(row: Row, input: HTMLInputElement): HTMLElement {
        const btn = wandButton(`Translate from ${localeDisplayName(rows[0].locale)} (AI)`, async () => {
            const from = rows[0];
            if (!from || !from.text) {
                status.textContent = 'Add the primary language text first.';
                return;
            }
            status.textContent = 'Translating…';
            try {
                row.text = await translateFn!(from.text, from.locale, row.locale);
                input.value = row.text;
                status.textContent = '';
            } catch (err) {
                status.textContent = `Translation failed: ${err instanceof Error ? err.message : String(err)}`;
            }
        });
        return btn;
    }

    function renderAddRow(): void {
        const present = new Set(rows.map(r => r.locale));
        const wrap = document.createElement('div');
        css(wrap, { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px',
            paddingTop: '8px', borderTop: '1px solid var(--vscode-editorWidget-border, #454545)' });

        const select = document.createElement('select');
        styleSelect(select);
        css(select, { flex: '1 1 auto' });
        for (const code of LOCALE_CODES) {
            if (present.has(code)) {
                continue;
            }
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = `${localeDisplayName(code)} (${code})`;
            select.appendChild(opt);
        }
        // Pre-select the current VS Code locale when it is still addable.
        if (!present.has(dialogLocale)) {
            select.value = dialogLocale;
        }
        wrap.appendChild(select);

        const add = document.createElement('button');
        add.type = 'button';
        add.textContent = '+ Add language';
        styleButton(add, true);
        add.disabled = select.options.length === 0;
        add.addEventListener('click', () => {
            if (select.value) {
                rows = [...rows, { locale: select.value, text: '' }];
                renderRows();
            }
        });
        wrap.appendChild(add);
        rowsEl.appendChild(wrap);
    }

    // Footer: Cancel / Apply.
    const footer = document.createElement('div');
    css(footer, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    styleButton(cancel, false);
    cancel.addEventListener('click', close);
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = 'Apply';
    styleButton(apply, true);
    apply.addEventListener('click', () => {
        onApply(i18nFromEntries(rows.map(r => [r.locale, r.text] as [string, string])));
        close();
    });
    footer.append(cancel, apply);
    modal.appendChild(footer);

    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
    window.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            window.removeEventListener('keydown', onKey);
        }
    });

    renderRows();
    document.body.appendChild(backdrop);
    (rowsEl.querySelector('input') as HTMLInputElement | null)?.focus();
}

/** VS Code "sparkle"/magic-wand glyph used for AI-generated actions; inherits text colour. */
const WAND_SVG =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">' +
    '<path d="M9.1 1.2 10 3.9l2.7.9-2.7.9-.9 2.7-.9-2.7L5.5 4.8l2.7-.9z"/>' +
    '<path d="M12.6 8.6l.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55z"/>' +
    '<path d="M4 8.5l.5 1.4 1.4.5-1.4.5L4 12.3l-.5-1.4L2.1 10.4l1.4-.5z"/>' +
    '</svg>';

function styleIconBtn(btn: HTMLButtonElement): void {
    css(btn, {
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', padding: '2px 6px', cursor: 'pointer',
        border: '1px solid var(--vscode-button-border, transparent)', borderRadius: '2px',
        color: 'var(--vscode-button-secondaryForeground, #fff)',
        background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    });
}

function iconBtn(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = glyph;
    btn.title = title;
    styleIconBtn(btn);
    btn.addEventListener('click', onClick);
    return btn;
}

/** An icon button rendering the AI-sparkle glyph (for the translate trigger). */
function wandButton(title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.innerHTML = WAND_SVG;
    styleIconBtn(btn);
    btn.addEventListener('click', onClick);
    return btn;
}

function styleButton(btn: HTMLButtonElement, primary: boolean): void {
    css(btn, {
        fontSize: '12px', padding: '4px 12px', cursor: 'pointer',
        border: 'none', borderRadius: '2px',
        color: primary ? 'var(--vscode-button-foreground, #fff)' : 'var(--vscode-button-secondaryForeground, #fff)',
        background: primary ? 'var(--vscode-button-background, #0e639c)' : 'var(--vscode-button-secondaryBackground, #3a3d41)',
    });
}
