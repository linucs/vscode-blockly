/**
 * A translatable text value as it appears in catalog YAML: either a plain string
 * or an **ordered** locale map (`{ en: "...", it: "...", … }`). The guided editor
 * carries it verbatim through the meta-block's `extraState` — Model A keeps the
 * authored message/tooltip/description text exactly (no regeneration), so a
 * `serialize(import(yaml))` is semantically identical to the original (design §5c).
 *
 * Pure and vscode-free: imported into both the host serializer and the webview.
 */
export type I18nText = string | Record<string, string>;

/** True when `value` is a non-empty locale map (vs a plain string). */
export function isI18nMap(value: unknown): value is Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length > 0 && entries.every(([, v]) => typeof v === 'string');
}

/**
 * Coerce a raw parsed value to an {@link I18nText}, or `undefined` when there is
 * nothing translatable (absent, empty string, empty/!string map). Locale-key
 * order is preserved (js-yaml keeps insertion order) so re-emission matches.
 */
export function readI18n(raw: unknown): I18nText | undefined {
    if (typeof raw === 'string') {
        return raw.length > 0 ? raw : undefined;
    }
    if (isI18nMap(raw)) {
        return { ...raw };
    }
    return undefined;
}

/**
 * The guided editor edits the **primary locale** inline as a normal field while the
 * other translations are preserved verbatim. The primary locale is the **first key**
 * by insertion order (which is the first key in the YAML map) — the translation
 * dialog pins it to the top and serialization keeps map order, so "first entry =
 * primary" holds end to end. {@link i18nDisplay} is the string shown/edited;
 * {@link i18nMerge} folds an edit back, keeping the other locales and key order.
 */
export function i18nDisplay(value: I18nText | undefined): string {
    if (value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    return Object.values(value)[0] ?? '';
}

/** The primary locale key of a map (the first by insertion order); `undefined` for a scalar. */
export function primaryLocale(value: I18nText | undefined): string | undefined {
    if (value === undefined || typeof value === 'string') {
        return undefined;
    }
    return Object.keys(value)[0];
}

/** Fold an edited primary-locale string back into an i18n value, preserving other locales. */
export function i18nMerge(original: I18nText | undefined, edited: string): I18nText {
    const key = primaryLocale(original);
    if (key === undefined) {
        return edited;
    }
    return { ...(original as Record<string, string>), [key]: edited };
}

/**
 * Build an {@link I18nText} from the translation dialog's ordered rows. Empty-text
 * rows are dropped; the result collapses to a plain string when a single locale
 * remains (the scalar form — matching the corpus and runtime safety) and is an
 * ordered locale→text map otherwise, with the first surviving row as the primary
 * (first) key. Returns `''` when nothing is left.
 */
export function i18nFromEntries(entries: Array<[string, string]>): I18nText {
    const kept = entries.filter(([, text]) => text.length > 0);
    if (kept.length === 0) {
        return '';
    }
    if (kept.length === 1) {
        return kept[0][1];
    }
    return Object.fromEntries(kept);
}
