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
