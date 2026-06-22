/**
 * The set of locale codes the translation dialog's "add language" dropdown offers.
 *
 * Catalog i18n is open-ended: any locale may appear in a `{ en: …, it: … }` map,
 * so this is **not** the project's 14 shipped UI locales (`BLOCKLY_LOCALES` in
 * `webview/blocklyBootstrap.ts`) — it is the full ISO 639-1 (BCP-47 primary)
 * language-subtag set. Codes only: human-readable names are derived at render time
 * via `Intl.DisplayNames`, so there is no name table to maintain or translate.
 */
export const LOCALE_CODES: readonly string[] = [
    'ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az',
    'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my',
    'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs',
    'da', 'dv', 'nl', 'dz',
    'en', 'eo', 'et', 'ee',
    'fo', 'fj', 'fi', 'fr', 'ff',
    'gl', 'ka', 'de', 'el', 'gn', 'gu',
    'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu',
    'ia', 'id', 'ie', 'ga', 'ig', 'ik', 'io', 'is', 'it', 'iu',
    'ja', 'jv',
    'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'ky', 'kv', 'kg', 'ko', 'ku', 'kj',
    'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
    'gv', 'mk', 'mg', 'ms', 'ml', 'mt', 'mi', 'mr', 'mh', 'mn',
    'na', 'nv', 'nd', 'ne', 'ng', 'nb', 'nn', 'no', 'ii', 'nr',
    'oc', 'oj', 'cu', 'om', 'or', 'os',
    'pa', 'pi', 'fa', 'pl', 'ps', 'pt',
    'qu',
    'rm', 'rn', 'ro', 'ru',
    'sa', 'sc', 'sd', 'se', 'sm', 'sg', 'sr', 'gd', 'sn', 'si', 'sk', 'sl', 'so', 'st', 'es', 'su', 'sw', 'ss', 'sv',
    'ta', 'te', 'tg', 'th', 'ti', 'bo', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
    'ug', 'uk', 'ur', 'uz',
    've', 'vi', 'vo',
    'wa', 'cy', 'wo',
    'fy', 'xh',
    'yi', 'yo',
    'za', 'zu',
];

/** Display name for a locale code via `Intl.DisplayNames`, falling back to the code. */
export function localeDisplayName(code: string): string {
    try {
        const dn = new Intl.DisplayNames(['en'], { type: 'language' });
        return dn.of(code) ?? code;
    } catch {
        return code;
    }
}
