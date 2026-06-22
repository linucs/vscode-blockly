import * as Blockly from 'blockly';
import { FieldCode } from '../../custom-fields/FieldCode';
import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';

/**
 * Codegen + catch-all meta-blocks:
 * - `code_line` — one line of generated code (a `body`/`setup`/`imports`/… entry).
 * - `helper` — one named helper function (`helpers[name] = body`).
 * - `raw_blockly_prop` — the top-level-attribute catch-all: any `blockly` key the
 *   guided editor doesn't model, carried verbatim (`KEY` + the value in extraState).
 */
interface RawPropBlock extends Blockly.Block {
    value_: unknown;
}

export function defineCodegenBlocks(): void {
    Blockly.Blocks['code_line'] = {
        init(this: Blockly.Block): void {
            // Multiline: a single codegen entry may contain newlines (e.g. a Python
            // `def …:\n  …`); a single-line field would strip them and break round-trip.
            // FieldCode = truncated preview + monospace modal (comfortable for code).
            this.appendDummyInput()
                .appendField(new FieldCode(''), 'TEXT');
            this.setPreviousStatement(true, CHECK.CODELINE);
            this.setNextStatement(true, CHECK.CODELINE);
            this.setColour(CATEGORY_COLOUR.codegen);
            this.setTooltip('One line of generated code. Use {{NAME}} placeholders.');
        },
    };

    Blockly.Blocks['helper'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('helper')
                .appendField(new Blockly.FieldTextInput(''), 'NAME');
            // Helper bodies are multi-line functions — preserve newlines.
            this.appendDummyInput()
                .appendField('body')
                .appendField(new FieldCode(''), 'BODY');
            this.setPreviousStatement(true, CHECK.HELPER);
            this.setNextStatement(true, CHECK.HELPER);
            this.setColour(CATEGORY_COLOUR.codegen);
            this.setTooltip('A named helper function (helpers[name] = body).');
        },
    };

    Blockly.Blocks['raw_blockly_prop'] = {
        init(this: RawPropBlock): void {
            this.value_ = undefined;
            this.appendDummyInput()
                .appendField('prop')
                .appendField(new Blockly.FieldTextInput(''), 'KEY')
                .appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            this.setPreviousStatement(true, CHECK.RAWPROP);
            this.setNextStatement(true, CHECK.RAWPROP);
            this.setColour(0);
            this.setTooltip('A Blockly attribute the guided editor does not model yet (preserved verbatim).');
        },
        saveExtraState(this: RawPropBlock): Record<string, unknown> {
            return { value: this.value_ };
        },
        loadExtraState(this: RawPropBlock, state: { value?: unknown }): void {
            this.value_ = state?.value;
            this.setFieldValue(`= ${JSON.stringify(state?.value ?? null)}`.slice(0, 40), 'SUMMARY');
        },
    };
}
