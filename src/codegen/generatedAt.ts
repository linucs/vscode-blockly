/**
 * Formats the "last generated" timestamp stamped into generated source headers
 * (both C++ and Python). UTC is used so the stamp is unambiguous and independent
 * of the machine's timezone.
 *
 * Pure (no Blockly/VS Code deps) so it can be imported into the webview bundle
 * and unit tested. Example output: `2026-06-14 12:34:56 UTC`.
 */
export function formatGeneratedAt(date: Date): string {
    return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}
