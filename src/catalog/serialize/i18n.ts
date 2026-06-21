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
 * M3 i18n editing: the guided editor edits the **primary locale** (`en`, or the
 * first key) inline as a normal field while the other translations are preserved
 * verbatim. {@link i18nDisplay} is the string shown/edited; {@link i18nMerge} folds
 * an edit back, keeping the other locales and key order.
 */
export function i18nDisplay(value: I18nText | undefined): string {
    if (value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if ('en' in value) {
        return value.en;
    }
    return Object.values(value)[0] ?? '';
}

/** The primary locale key of a map (`en` or first); `undefined` for a scalar. */
function primaryLocale(value: I18nText | undefined): string | undefined {
    if (value === undefined || typeof value === 'string') {
        return undefined;
    }
    return 'en' in value ? 'en' : Object.keys(value)[0];
}

/** Fold an edited primary-locale string back into an i18n value, preserving other locales. */
export function i18nMerge(original: I18nText | undefined, edited: string): I18nText {
    const key = primaryLocale(original);
    if (key === undefined) {
        return edited;
    }
    return { ...(original as Record<string, string>), [key]: edited };
}
