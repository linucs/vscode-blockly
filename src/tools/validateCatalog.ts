import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../catalog/block-catalog_v1.schema.json';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Validate a multi-document block catalog YAML string against the bundled JSON
 * schema and run structural checks (duplicate types, output/precedence
 * consistency, WYSIWYG, placeholder and inputDefaults coverage).
 * Returns a human-readable summary. Host-agnostic.
 */
export function validateCatalogYaml(input: string): string {
    const errors: string[] = [];
    const allTypes = new Set<string>();
    let docCount = 0;
    let blockCount = 0;

    let docs: unknown[];
    try {
        docs = yaml.loadAll(input) as unknown[];
    } catch (err) {
        return `YAML parse error: ${err instanceof Error ? err.message : String(err)}`;
    }

    for (const doc of docs) {
        if (doc === null || doc === undefined) continue;
        docCount++;

        if (!validate(doc)) {
            for (const e of validate.errors ?? []) {
                errors.push(`Doc ${docCount}: ${e.instancePath} ${e.message}`);
            }
        }

        const entry = doc as Record<string, unknown>;
        const impls = entry.implementations as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(impls)) continue;

        for (const impl of impls) {
            const implCodegen = impl.codegen as Record<string, unknown> | undefined;
            const implSetup = implCodegen?.setup as string[] | undefined;
            if (implSetup && implSetup.length > 0) {
                errors.push(`WYSIWYG violation: implementation-level codegen.setup should not contain init calls (found: ${implSetup.join(', ')}). Provide explicit init blocks instead.`);
            }

            const blocks = impl.blocks as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(blocks)) continue;

            for (const block of blocks) {
                blockCount++;
                const blockly = block.blockly as Record<string, unknown> | undefined;
                if (!blockly) continue;

                const type = blockly.type as string | undefined;
                if (type) {
                    if (allTypes.has(type)) errors.push(`Duplicate block type: "${type}"`);
                    allTypes.add(type);
                }

                const hasOutput = blockly.output !== undefined;
                const codegen = block.codegen as Record<string, unknown> | undefined;
                const hasPrecedence = codegen?.precedence !== undefined;

                if (hasOutput && !hasPrecedence) {
                    errors.push(`Block "${type}": has output but missing codegen.precedence`);
                }
                if (!hasOutput && hasPrecedence) {
                    errors.push(`Block "${type}": has precedence but no output`);
                }

                checkI18nFields(blockly, type, errors);
                checkPlaceholders(blockly, codegen, type, errors);
                checkInputDefaults(blockly, codegen, type, errors);
            }
        }
    }

    if (errors.length === 0) {
        return `Valid. ${docCount} document(s), ${blockCount} block(s).`;
    }
    return `Validation found ${errors.length} issue(s):\n\n${errors.map(e => `- ${e}`).join('\n')}`;
}

const MSG_FIELD_RE = /^message\d+$/;
const I18N_FIELDS = new Set(['tooltip']);

function resolveI18nString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (typeof obj['en'] === 'string') return obj['en'] as string;
    }
    return undefined;
}

function checkI18nFields(
    blockly: Record<string, unknown>,
    type: string | undefined,
    errors: string[]
) {
    for (const key of Object.keys(blockly)) {
        if (!MSG_FIELD_RE.test(key) && !I18N_FIELDS.has(key)) continue;
        const val = blockly[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            const obj = val as Record<string, unknown>;
            if (!('en' in obj)) {
                errors.push(`Block "${type}": i18n field "${key}" is an object but missing required "en" key`);
                continue;
            }
            const enMsg = typeof obj['en'] === 'string' ? obj['en'] : '';
            const enPlaceholders = (enMsg.match(/%\d+/g) ?? []).sort();
            for (const [lang, text] of Object.entries(obj)) {
                if (lang === 'en' || typeof text !== 'string') continue;
                const langPlaceholders = (text.match(/%\d+/g) ?? []).sort();
                if (JSON.stringify(enPlaceholders) !== JSON.stringify(langPlaceholders)) {
                    errors.push(`Block "${type}": i18n "${key}" locale "${lang}" has different placeholders than "en" (en: ${enPlaceholders.join(',')} vs ${lang}: ${langPlaceholders.join(',')})`);
                }
            }
        }
    }
}

function checkPlaceholders(
    blockly: Record<string, unknown>,
    codegen: Record<string, unknown> | undefined,
    type: string | undefined,
    errors: string[]
) {
    if (!codegen) return;

    const definedNames = new Set<string>();
    for (let i = 0; i < 10; i++) {
        const args = blockly[`args${i}`] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(args)) break;
        for (const arg of args) {
            if (arg.name) definedNames.add(arg.name as string);
        }
    }

    const codegenText = JSON.stringify(codegen);
    const placeholders = codegenText.match(/\{\{(\w+)(?:\.\w+)?\}\}/g) ?? [];
    for (const ph of placeholders) {
        const name = ph.replace(/\{\{(\w+)(?:\.\w+)?\}\}/, '$1');
        if (!definedNames.has(name)) {
            errors.push(`Block "${type}": placeholder {{${name}}} not defined in args`);
        }
    }
}

function checkInputDefaults(
    blockly: Record<string, unknown>,
    codegen: Record<string, unknown> | undefined,
    type: string | undefined,
    errors: string[]
) {
    const defaults = codegen?.inputDefaults as Record<string, unknown> | undefined;
    if (!defaults) return;

    const inputValueNames = new Set<string>();
    for (let i = 0; i < 10; i++) {
        const args = blockly[`args${i}`] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(args)) break;
        for (const arg of args) {
            if (arg.type === 'input_value' && arg.name) inputValueNames.add(arg.name as string);
        }
    }

    for (const key of Object.keys(defaults)) {
        if (!inputValueNames.has(key)) {
            errors.push(`Block "${type}": inputDefault "${key}" does not correspond to an input_value`);
        }
    }
}
