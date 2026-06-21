import * as yaml from 'js-yaml';

/**
 * Reasons a catalog cannot be opened in the guided editor and must fall back to
 * the raw-text editor. Each maps to a construct the guided surface genuinely
 * *cannot* represent — not merely an invalid value. Schema validity is **not** a
 * gate: a schema-invalid-but-parseable file opens in blocks and surfaces its
 * issues as (non-blocking) validation messages, so the user can keep editing
 * where they left off. Only a construct the editor can't model at all sends the
 * file to text. The webview's import try/catch is the final net for files that
 * can't even be parsed into the meta-model.
 */
export type GuidedEditBlocker =
    | 'parse-error'           // YAML doesn't parse
    | 'multi-document'        // more than one YAML document in the file (one catalog block per workspace)
    | 'uses-generator'        // a block uses an imperative `generator:` (first-party TS)
    | 'uses-mutator';         // a block uses a Blockly `mutator` (not modeled yet)

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
 * M3 models block definitions (Model A), impl-level `codegen`, and i18n-object
 * `description`/`message`/`tooltip` — so those are now guided-editable. The
 * remaining fallbacks are the genuinely un-modelable: an imperative `generator:`
 * (first-party TS tier), a Blockly `mutator`, multiple YAML documents, and parse
 * errors. Schema validity is intentionally **not** checked here — over-strict
 * schema rules must not deny block editing; invalid values surface as validation
 * messages instead. Files that can't be imported into the meta-model at all fall
 * back via the webview's import try/catch.
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
        if (!Array.isArray(impls)) {
            continue;
        }
        for (const impl of impls) {
            const blocks = impl.blocks as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(blocks)) {
                continue;
            }
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

    // Everything else — including a schema-invalid or blocks-incomplete catalog —
    // opens in the guided editor. Invalid values become validation messages; the
    // webview's import try/catch handles anything that can't be modeled at all.
    return { ok: true };
}
