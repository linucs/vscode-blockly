import * as Blockly from 'blockly';
import { FieldMultilineInput } from '@blockly/field-multilineinput';
import { CHECK } from '../connectionChecks';

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
            this.appendDummyInput()
                .appendField(new FieldMultilineInput(''), 'TEXT');
            this.setPreviousStatement(true, CHECK.CODELINE);
            this.setNextStatement(true, CHECK.CODELINE);
            this.setColour(20);
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
                .appendField(new FieldMultilineInput(''), 'BODY');
            this.setPreviousStatement(true, CHECK.HELPER);
            this.setNextStatement(true, CHECK.HELPER);
            this.setColour(20);
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
