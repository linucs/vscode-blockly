import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from './block-catalog_v1.schema.json';
import type { CatalogIssue } from './catalogIssue';

export type { CatalogIssue } from './catalogIssue';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/** Structured result of validating a catalog YAML string. */
export interface CatalogValidationResult {
    issues: CatalogIssue[];
    docCount: number;
    blockCount: number;
    /** Set when the YAML itself failed to parse; in that case `issues` is empty. */
    parseError?: string;
}

/**
 * Structured validation core: validates a multi-document block catalog YAML
 * string against the bundled JSON schema and runs structural checks (duplicate
 * types, output/precedence consistency, placeholder and inputDefaults coverage).
 * Returns structured issues; the string API (`validateCatalogYaml`) is a formatter
 * over this. Host-agnostic.
 */
export function validateCatalogResult(input: string): CatalogValidationResult {
    const issues: CatalogIssue[] = [];
    const allTypes = new Set<string>();
    let docCount = 0;
    let blockCount = 0;

    let docs: unknown[];
    try {
        docs = yaml.loadAll(input) as unknown[];
    } catch (err) {
        return { issues: [], docCount: 0, blockCount: 0, parseError: err instanceof Error ? err.message : String(err) };
    }

    const error = (path: string, message: string, kind: 'schema' | 'structural' = 'structural') =>
        issues.push({ severity: 'error', kind, path, message });
    const warn = (path: string, message: string) =>
        issues.push({ severity: 'warning', kind: 'structural', path, message });

    for (const doc of docs) {
        if (doc === null || doc === undefined) continue;
        docCount++;

        if (!validate(doc)) {
            for (const e of validate.errors ?? []) {
                error(`Doc ${docCount}`, `${e.instancePath} ${e.message}`, 'schema');
            }
        }

        const entry = doc as Record<string, unknown>;
        // A description i18n map must include `en`: the runtime resolves a locale
        // map as `map[locale] ?? map.en` (catalogI18nPreprocess), so a map without
        // `en` renders empty for any user not on one of its locales. Mirrors the
        // block-level `en` guard in checkI18nFields.
        const desc = entry.description;
        if (desc && typeof desc === 'object' && !Array.isArray(desc) && !('en' in (desc as object))) {
            error(`Catalog "${typeof entry.id === 'string' ? entry.id : ''}"`, 'description is an object but missing required "en" key');
        }
        const impls = entry.implementations as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(impls)) continue;

        for (const impl of impls) {
            const deps = impl.dependencies as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(deps)) {
                const seenDeps = new Set<string>();
                for (const dep of deps) {
                    if (typeof dep.name !== 'string' || !dep.name) {
                        continue;
                    }
                    const key = `${dep.type as string}:${dep.name}`;
                    if (seenDeps.has(key)) {
                        warn('', `Duplicate dependency: ${dep.type as string} "${dep.name}" is listed more than once in runtime "${impl.runtime as string}".`);
                    }
                    seenDeps.add(key);
                }
            }

            const blocks = impl.blocks as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(blocks)) continue;

            for (const block of blocks) {
                blockCount++;
                const blockly = block.blockly as Record<string, unknown> | undefined;
                if (!blockly) continue;

                const type = blockly.type as string | undefined;
                if (type) {
                    if (allTypes.has(type)) error('', `Duplicate block type: "${type}"`);
                    allTypes.add(type);
                }

                const hasOutput = blockly.output !== undefined;
                const codegen = block.codegen as Record<string, unknown> | undefined;
                const hasPrecedence = codegen?.precedence !== undefined;

                if (hasOutput && !hasPrecedence) {
                    error(`Block "${type}"`, 'has output but missing codegen.precedence');
                }
                if (!hasOutput && hasPrecedence) {
                    error(`Block "${type}"`, 'has precedence but no output');
                }

                checkI18nFields(blockly, type, error);
                checkPlaceholders(blockly, codegen, type, error);
                checkInputDefaults(blockly, codegen, type, error);
            }
        }
    }

    return { issues, docCount, blockCount };
}

/** Convenience accessor returning only the issues (parse error becomes one issue). */
export function validateCatalogIssues(input: string): CatalogIssue[] {
    const result = validateCatalogResult(input);
    if (result.parseError !== undefined) {
        return [{ severity: 'error', kind: 'schema', path: '', message: `YAML parse error: ${result.parseError}` }];
    }
    return result.issues;
}

/** Render an issue back to the original flat form used by the string summary. */
function flattenIssue(issue: CatalogIssue): string {
    return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
}

/**
 * Validate a catalog YAML string and return a human-readable summary. Thin
 * formatter over {@link validateCatalogResult}; the `Valid.` prefix and issue
 * wording are a stable contract relied on by the MCP tool and the contribution
 * gate (see contributeCatalog.ts). Host-agnostic.
 */
export function validateCatalogYaml(input: string): string {
    const result = validateCatalogResult(input);
    if (result.parseError !== undefined) {
        return `YAML parse error: ${result.parseError}`;
    }
    if (result.issues.length === 0) {
        return `Valid. ${result.docCount} document(s), ${result.blockCount} block(s).`;
    }
    return `Validation found ${result.issues.length} issue(s):\n\n${result.issues.map(e => `- ${flattenIssue(e)}`).join('\n')}`;
}

type ReportFn = (path: string, message: string) => void;

const MSG_FIELD_RE = /^message\d+$/;
const I18N_FIELDS = new Set(['tooltip']);

function checkI18nFields(
    blockly: Record<string, unknown>,
    type: string | undefined,
    error: ReportFn
) {
    const scope = `Block "${type}"`;
    for (const key of Object.keys(blockly)) {
        if (!MSG_FIELD_RE.test(key) && !I18N_FIELDS.has(key)) continue;
        const val = blockly[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const obj = val as Record<string, unknown>;
            if (!('en' in obj)) {
                error(scope, `i18n field "${key}" is an object but missing required "en" key`);
                continue;
            }
            const enMsg = typeof obj['en'] === 'string' ? obj['en'] : '';
            const enPlaceholders = (enMsg.match(/%\d+/g) ?? []).sort();
            for (const [lang, text] of Object.entries(obj)) {
                if (lang === 'en' || typeof text !== 'string') continue;
                const langPlaceholders = (text.match(/%\d+/g) ?? []).sort();
                if (JSON.stringify(enPlaceholders) !== JSON.stringify(langPlaceholders)) {
                    error(scope, `i18n "${key}" locale "${lang}" has different placeholders than "en" (en: ${enPlaceholders.join(',')} vs ${lang}: ${langPlaceholders.join(',')})`);
                }
            }
        }
    }
}

function checkPlaceholders(
    blockly: Record<string, unknown>,
    codegen: Record<string, unknown> | undefined,
    type: string | undefined,
    error: ReportFn
) {
    if (!codegen) return;

    const definedNames = new Set<string>();
    // Indices can be sparse (e.g. message0 with no args0, then args1/args2 on a
    // hat block) — scan all of them, don't stop at the first gap.
    for (let i = 0; i < 10; i++) {
        const args = blockly[`args${i}`] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(args)) continue;
        for (const arg of args) {
            if (arg.name) definedNames.add(arg.name as string);
        }
    }

    const codegenText = JSON.stringify(codegen);
    const placeholders = codegenText.match(/\{\{(\w+)(?:\.\w+)?\}\}/g) ?? [];
    for (const ph of placeholders) {
        const name = ph.replace(/\{\{(\w+)(?:\.\w+)?\}\}/, '$1');
        if (!definedNames.has(name)) {
            error(`Block "${type}"`, `placeholder {{${name}}} not defined in args`);
        }
    }
}

function checkInputDefaults(
    blockly: Record<string, unknown>,
    codegen: Record<string, unknown> | undefined,
    type: string | undefined,
    error: ReportFn
) {
    const defaults = codegen?.inputDefaults as Record<string, unknown> | undefined;
    if (!defaults) return;

    const inputValueNames = new Set<string>();
    for (let i = 0; i < 10; i++) {
        const args = blockly[`args${i}`] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(args)) continue;
        for (const arg of args) {
            if (arg.type === 'input_value' && arg.name) inputValueNames.add(arg.name as string);
        }
    }

    for (const key of Object.keys(defaults)) {
        if (!inputValueNames.has(key)) {
            error(`Block "${type}"`, `inputDefault "${key}" does not correspond to an input_value`);
        }
    }
}
