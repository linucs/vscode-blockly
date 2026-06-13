import * as Blockly from 'blockly';
import { ORDER } from './order';

/**
 * L2 generators for Blockly's built-in text blocks, retargeted at the Arduino
 * `String` class (`String::length/indexOf/substring/trim/…`). These depend on
 * the Arduino environment — `String` is part of the Arduino core, not ISO C++ —
 * so they live here rather than in the L1 language file (cppLanguageBlocks.ts).
 * The block *definitions* remain Blockly-core (including `text_join`'s variadic
 * mutator); we own only the code generation.
 *
 * `paramVarIds` is forwarded so `text_append` skips emitting a `String`
 * declaration for variables that are already function parameters.
 */
export function registerArduinoStringGenerators(
    g: Blockly.CodeGenerator,
    paramVarIds: ReadonlySet<string>,
): void {
    const f = g.forBlock;
    const val = (b: Blockly.Block, name: string, order: number, fallback: string) =>
        g.valueToCode(b, name, order) || fallback;

    f['text_join'] = (b) => {
        const itemCount = (b as any).itemCount_ ?? 0;
        if (itemCount === 0) return ['""', ORDER.ATOMIC];
        if (itemCount === 1) {
            const item = g.valueToCode(b, 'ADD0', ORDER.NONE) || '""';
            return [`String(${item})`, ORDER.FUNCTION_CALL];
        }
        const parts: string[] = [];
        for (let i = 0; i < itemCount; i++) {
            const item = g.valueToCode(b, 'ADD' + i, ORDER.NONE);
            parts.push(item ? `String(${item})` : '""');
        }
        return [parts.join(' + '), ORDER.ADDITIVE];
    };

    f['text_append'] = (b) => {
        const varId = b.getFieldValue('VAR');
        const name = g.getVariableName(varId);
        const text = val(b, 'TEXT', ORDER.NONE, '""');
        if (!paramVarIds.has(varId)) {
            (g as any).definitions_[`decl_var_${name}`] = `String ${name} = "";`;
        }
        return `${name} += String(${text});\n`;
    };

    f['text_length'] = (b) => {
        const text = val(b, 'VALUE', ORDER.NONE, '""');
        return [`String(${text}).length()`, ORDER.FUNCTION_CALL];
    };

    f['text_isEmpty'] = (b) => {
        const text = val(b, 'VALUE', ORDER.NONE, '""');
        return [`(String(${text}).length() == 0)`, ORDER.EQUALITY];
    };

    f['text_indexOf'] = (b) => {
        const operator = b.getFieldValue('END') === 'FIRST' ? 'indexOf' : 'lastIndexOf';
        const substring = val(b, 'FIND', ORDER.NONE, '""');
        const text = val(b, 'VALUE', ORDER.NONE, '""');
        return [`String(${text}).${operator}(${substring})`, ORDER.FUNCTION_CALL];
    };

    f['text_charAt'] = (b) => {
        const where = b.getFieldValue('WHERE') || 'FROM_START';
        const text = val(b, 'VALUE', ORDER.NONE, '""');
        switch (where) {
            case 'FIRST':
                return [`String(${text}).charAt(0)`, ORDER.FUNCTION_CALL];
            case 'LAST':
                return [`String(${text}).charAt(String(${text}).length() - 1)`, ORDER.FUNCTION_CALL];
            case 'FROM_START': {
                const at = val(b, 'AT', ORDER.NONE, '0');
                return [`String(${text}).charAt(${at})`, ORDER.FUNCTION_CALL];
            }
            case 'FROM_END': {
                const at = val(b, 'AT', ORDER.NONE, '0');
                return [`String(${text}).charAt(String(${text}).length() - 1 - ${at})`, ORDER.FUNCTION_CALL];
            }
            default:
                return [`String(${text}).charAt(0)`, ORDER.FUNCTION_CALL];
        }
    };

    f['text_getSubstring'] = (b) => {
        const text = val(b, 'STRING', ORDER.NONE, '""');
        const where1 = b.getFieldValue('WHERE1') || 'FROM_START';
        const where2 = b.getFieldValue('WHERE2') || 'FROM_START';

        let from: string;
        switch (where1) {
            case 'FIRST':      from = '0'; break;
            case 'FROM_START': from = val(b, 'AT1', ORDER.NONE, '0'); break;
            case 'FROM_END':   from = `String(${text}).length() - 1 - ${val(b, 'AT1', ORDER.NONE, '0')}`; break;
            default:           from = '0';
        }

        let to: string;
        switch (where2) {
            case 'LAST':       to = `String(${text}).length()`; break;
            case 'FROM_START': to = `${val(b, 'AT2', ORDER.NONE, '0')} + 1`; break;
            case 'FROM_END':   to = `String(${text}).length() - ${val(b, 'AT2', ORDER.NONE, '0')}`; break;
            default:           to = `String(${text}).length()`;
        }

        return [`String(${text}).substring(${from}, ${to})`, ORDER.FUNCTION_CALL];
    };

    f['text_changeCase'] = (b) => {
        const operator = b.getFieldValue('CASE');
        const text = val(b, 'TEXT', ORDER.NONE, '""');
        switch (operator) {
            case 'UPPERCASE':  return [`String(${text}).toUpperCase()`, ORDER.FUNCTION_CALL];
            case 'LOWERCASE':  return [`String(${text}).toLowerCase()`, ORDER.FUNCTION_CALL];
            default:           return [`String(${text})`, ORDER.FUNCTION_CALL];
        }
    };

    f['text_trim'] = (b) => {
        const text = val(b, 'TEXT', ORDER.NONE, '""');
        return [`String(${text}).trim()`, ORDER.FUNCTION_CALL];
    };
}
