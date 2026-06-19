import * as yaml from 'js-yaml';
import { validateCatalogResult } from './validateCatalog';

/**
 * Reasons a catalog cannot be opened in the guided editor and must fall back to
 * the raw-text editor. Each maps to a construct the guided surface can't
 * faithfully represent and round-trip (design §5d).
 */
export type GuidedEditBlocker =
    | 'parse-error'      // YAML doesn't parse
    | 'schema-invalid'   // fails the catalog JSON schema
    | 'multi-document'   // more than one YAML document in the file
    | 'uses-generator'   // a block uses an imperative `generator:` (first-party TS)
    | 'uses-mutator';    // a block uses a Blockly `mutator` (not modeled yet)

export interface GuidedEditCheck {
    ok: boolean;
    /** Set when `ok` is false; the first blocker found. */
    reason?: GuidedEditBlocker;
}

/**
 * Static, pure predicate (no `vscode`) deciding whether a catalog YAML can be
 * edited in the guided Blockly editor. Returns `{ ok: false, reason }` for the
 * structurally-unrepresentable cases, which route to the existing raw-text
 * `edit()` branch. Allow-list refinement for individual attributes/fields lands
 * with the meta-blocks (M5); M1 covers the structural blockers.
 */
export function canEditInGuidedUi(yamlText: string): GuidedEditCheck {
    let docs: unknown[];
    try {
        docs = yaml.loadAll(yamlText) as unknown[];
    } catch {
        return { ok: false, reason: 'parse-error' };
    }

    const realDocs = docs.filter((d): d is Record<string, unknown> => d !== null && d !== undefined && typeof d === 'object');
    if (realDocs.length > 1) {
        return { ok: false, reason: 'multi-document' };
    }

    for (const doc of realDocs) {
        const impls = doc.implementations as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(impls)) continue;
        for (const impl of impls) {
            const blocks = impl.blocks as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(blocks)) continue;
            for (const block of blocks) {
                if (typeof block.generator === 'string' && block.generator.length > 0) {
                    return { ok: false, reason: 'uses-generator' };
                }
                const blockly = block.blockly as Record<string, unknown> | undefined;
                if (blockly && blockly.mutator !== undefined) {
                    return { ok: false, reason: 'uses-mutator' };
                }
            }
        }
    }

    // Schema validity is checked through the single validation core. Any
    // schema-level (AJV) error means the guided importer can't map the document.
    const result = validateCatalogResult(yamlText);
    if (result.parseError !== undefined) {
        return { ok: false, reason: 'parse-error' };
    }
    if (result.issues.some(i => i.kind === 'schema')) {
        return { ok: false, reason: 'schema-invalid' };
    }

    return { ok: true };
}
