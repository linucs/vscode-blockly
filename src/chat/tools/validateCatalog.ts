import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../../catalog/block-catalog_v1.schema.json';

interface ValidateInput { yaml: string }

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export class ValidateCatalogTool implements vscode.LanguageModelTool<ValidateInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ValidateInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const input = options.input.yaml;
        const errors: string[] = [];
        const allTypes = new Set<string>();
        let docCount = 0;
        let blockCount = 0;

        let docs: unknown[];
        try {
            docs = yaml.loadAll(input) as unknown[];
        } catch (err) {
            return textResult(`YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
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

                    checkPlaceholders(blockly, codegen, type, errors);
                    checkInputDefaults(blockly, codegen, type, errors);
                }
            }
        }

        if (errors.length === 0) {
            return textResult(`Valid. ${docCount} document(s), ${blockCount} block(s).`);
        }
        return textResult(`Validation found ${errors.length} issue(s):\n\n${errors.map(e => `- ${e}`).join('\n')}`);
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

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
