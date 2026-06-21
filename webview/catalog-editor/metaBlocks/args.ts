import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';

/**
 * The arg meta-blocks — one per `%N` of a message row (design "Model A"):
 * the inputs (`input_value`/`input_statement`/`input_dummy`) and the M3 fields
 * (`field_dropdown`/`field_input`/`field_number`). `field_generic` is the catch-all
 * that carries any other field type verbatim. All stack inside `message_row.ARGS`.
 *
 * Structured leaf data that isn't a plain field — a value input's `check` list, a
 * dropdown's `options`, a generic field's whole entry — is preserved in
 * `extraState` (full editing of those is M4). The editable fields are the common
 * ones: `NAME`, the text default, the numeric attributes.
 */

interface CheckBlock extends Blockly.Block {
    check_: unknown;
}
interface OptionsBlock extends Blockly.Block {
    options_: unknown;
}
interface GenericBlock extends Blockly.Block {
    entry_: Record<string, unknown> | undefined;
}

function arg(this: Blockly.Block, label: string, colour: number): void {
    this.setPreviousStatement(true, CHECK.ARG);
    this.setNextStatement(true, CHECK.ARG);
    this.setColour(colour);
    this.setTooltip(label);
}

export function defineArgBlocks(): void {
    for (const [type, label] of [['input_value', 'value input'], ['input_statement', 'statement input']] as const) {
        Blockly.Blocks[type] = {
            init(this: CheckBlock): void {
                this.check_ = undefined;
                this.appendDummyInput()
                    .appendField(label)
                    .appendField('name')
                    .appendField(new Blockly.FieldTextInput(''), 'NAME');
                arg.call(this, `A ${label} socket (%N).`, 210);
            },
            saveExtraState(this: CheckBlock): Record<string, unknown> {
                return this.check_ !== undefined ? { check: this.check_ } : {};
            },
            loadExtraState(this: CheckBlock, state: { check?: unknown }): void {
                this.check_ = state?.check;
            },
        };
    }

    Blockly.Blocks['input_dummy'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('dummy input')
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME');
            arg.call(this, 'A row with no socket.', 210);
        },
    };

    Blockly.Blocks['field_dropdown'] = {
        init(this: OptionsBlock): void {
            this.options_ = undefined;
            this.appendDummyInput()
                .appendField('dropdown')
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME')
                .appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            arg.call(this, 'A dropdown field (%N).', 160);
        },
        saveExtraState(this: OptionsBlock): Record<string, unknown> {
            return { options: this.options_ };
        },
        loadExtraState(this: OptionsBlock, state: { options?: unknown }): void {
            this.options_ = state?.options;
            const count = Array.isArray(state?.options) ? state!.options.length : 0;
            this.setFieldValue(`(${count} options)`, 'SUMMARY');
        },
    };

    Blockly.Blocks['field_input'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('text field')
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME')
                .appendField('default')
                .appendField(new Blockly.FieldTextInput(''), 'TEXT');
            arg.call(this, 'A text field (%N).', 160);
        },
    };

    Blockly.Blocks['field_number'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('number field')
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME')
                .appendField('value')
                .appendField(new Blockly.FieldTextInput(''), 'VALUE')
                .appendField('min')
                .appendField(new Blockly.FieldTextInput(''), 'MIN')
                .appendField('max')
                .appendField(new Blockly.FieldTextInput(''), 'MAX')
                .appendField('precision')
                .appendField(new Blockly.FieldTextInput(''), 'PRECISION');
            arg.call(this, 'A number field (%N).', 160);
        },
    };

    Blockly.Blocks['field_generic'] = {
        init(this: GenericBlock): void {
            this.entry_ = undefined;
            this.appendDummyInput()
                .appendField('field')
                .appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            arg.call(this, 'A field type the guided editor does not model yet (preserved verbatim).', 0);
        },
        saveExtraState(this: GenericBlock): Record<string, unknown> {
            return { entry: this.entry_ };
        },
        loadExtraState(this: GenericBlock, state: { entry?: Record<string, unknown> }): void {
            this.entry_ = state?.entry;
            const t = state?.entry?.type ?? 'unknown';
            this.setFieldValue(`${t}`, 'SUMMARY');
        },
    };
}
