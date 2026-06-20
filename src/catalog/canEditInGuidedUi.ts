import * as yaml from 'js-yaml';
import { validateCatalogResult } from './validateCatalog';

/**
 * Reasons a catalog cannot be opened in the guided editor and must fall back to
 * the raw-text editor. Each maps to a construct the guided surface can't
 * faithfully represent and round-trip (design §5d).
 */
export type GuidedEditBlocker =
    | 'parse-error'           // YAML doesn't parse
    | 'schema-invalid'        // fails the catalog JSON schema
    | 'multi-document'        // more than one YAML document in the file
    | 'uses-generator'        // a block uses an imperative `generator:` (first-party TS)
    | 'uses-mutator'          // a block uses a Blockly `mutator` (not modeled yet)
    | 'has-block-definitions'; // contains constructs M2's guided surface can't model yet

export interface GuidedEditCheck {
    ok: boolean;
    /** Set when `ok` is false; the first blocker found. */
    reason?: GuidedEditBlocker;
}

/**
 * Static, pure predicate (no `vscode`) deciding whether a catalog YAML can be
 * edited in the guided Blockly editor. Returns `{ ok: false, reason }` for the
 * structurally-unrepresentable cases, which route to the existing raw-text
 * `edit()` branch.
 *
 * In M2 the guided surface models all top-level metadata (including the `docs`
 * map), implementations, and dependencies — but not block definitions, impl-level
 * `codegen`, or an i18n-object `description`. Files carrying any of those return
 * `has-block-definitions` and stay on the raw-text editor (no stash, no
 * reformatting of content the editor can't yet emit). M3 lifts this once
 * `factory_base` can faithfully import and emit blocks.
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
        // An i18n-object `description` (the translation subsystem) is not modeled
        // in M2; a plain-string description is. `docs` IS modeled (doc_link).
        if (doc.description !== undefined && typeof doc.description === 'object') {
            return { ok: false, reason: 'has-block-definitions' };
        }

        const impls = doc.implementations as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(impls)) continue;
        for (const impl of impls) {
            // Impl-level codegen is an M3 construct; route to text until then.
            if (impl.codegen !== undefined) {
                return { ok: false, reason: 'has-block-definitions' };
            }
            const blocks = impl.blocks as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(blocks)) continue;
            // Any block definition means the file needs the M3 block surface.
            if (blocks.length > 0) {
                for (const block of blocks) {
                    if (typeof block.generator === 'string' && block.generator.length > 0) {
                        return { ok: false, reason: 'uses-generator' };
                    }
                    const blockly = block.blockly as Record<string, unknown> | undefined;
                    if (blockly && blockly.mutator !== undefined) {
                        return { ok: false, reason: 'uses-mutator' };
                    }
                }
                return { ok: false, reason: 'has-block-definitions' };
            }
        }
    }

    // An empty file is a fresh, new catalog: nothing to validate — the guided
    // editor seeds an empty `catalog` block.
    if (realDocs.length === 0) {
        return { ok: true };
    }

    // Schema validity is checked through the single validation core, but a
    // metadata-only catalog is *legitimately* blocks-incomplete (authoring a
    // block is M3) — the schema's `blocks: minItems 1` rule must not bounce it to
    // text. So validate with a placeholder block injected: only schema errors
    // unrelated to the missing blocks gate the file to the raw-text editor. The
    // schema itself is untouched; save-time validation still blocks an
    // incomplete catalog.
    const result = validateCatalogResult(yaml.dump(withProbeBlocks(realDocs[0])));
    if (result.issues.some(i => i.kind === 'schema')) {
        return { ok: false, reason: 'schema-invalid' };
    }

    return { ok: true };
}

/** Minimal schema-valid block, injected only to satisfy `blocks: minItems 1`. */
const PROBE_BLOCK = { blockly: { type: '__guided_probe__' } };

/** Deep-clone `doc`, giving every implementation a placeholder block if it has none. */
function withProbeBlocks(doc: Record<string, unknown>): Record<string, unknown> {
    const clone = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    const impls = clone.implementations;
    if (Array.isArray(impls)) {
        for (const impl of impls) {
            if (impl && typeof impl === 'object') {
                const i = impl as Record<string, unknown>;
                if (!Array.isArray(i.blocks) || i.blocks.length === 0) {
                    i.blocks = [PROBE_BLOCK];
                }
            }
        }
    }
    return clone;
}
