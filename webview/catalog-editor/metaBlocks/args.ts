import * as Blockly from 'blockly';
import {
    FIELD_DESCRIPTORS,
    type FieldDescriptor,
} from '../../../src/catalog/serialize/fieldDescriptors';
import { INPUT_ALIGN_VALUES } from '../../../src/catalog/serialize/types';
import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';

/**
 * The arg meta-blocks — one per `%N` of a message row (design "Model A"): the
 * inputs (`input_value`/`input_statement`/`input_dummy`/`input_end_row`) and one
 * editable block per modeled field type, generated from {@link FIELD_DESCRIPTORS} (the single
 * source of truth shared with the serializer/importer). `field_generic` is the
 * catch-all that carries any unmodeled field type verbatim. All stack inside
 * `message_row.ARGS`.
 *
 * A field block edits its descriptor's scalar attributes as plain fields; its
 * structured leaf data (option lists, bitmap grids, variable-type lists) and any
 * unmodeled attributes (`rest`) are preserved in `extraState` and shown only as a
 * read-only summary — full structured editing is a later milestone (plan §M4 scope).
 */

/** An input block's preserved leaf state (`check` for value/statement, `rest` verbatim). */
interface InputStateBlock extends Blockly.Block {
    state_: Record<string, unknown>;
}
interface GenericBlock extends Blockly.Block {
    entry_: Record<string, unknown> | undefined;
}
/** A field block's structured + `rest` leaf state, round-tripped via extraState. */
interface FieldStateBlock extends Blockly.Block {
    state_: Record<string, unknown>;
}

function arg(this: Blockly.Block, label: string, colour: number): void {
    this.setPreviousStatement(true, CHECK.ARG);
    this.setNextStatement(true, CHECK.ARG);
    this.setColour(colour);
    this.setTooltip(label);
}

/** A one-line summary of a field's structured data, e.g. `(2 options)`, `(bitmap 8x12)`. */
function summarizeStructured(desc: FieldDescriptor, state: Record<string, unknown> | undefined): string {
    const parts: string[] = [];
    for (const key of desc.structured) {
        const value = state?.[key];
        if (!Array.isArray(value)) {
            continue;
        }
        if (key === 'value') {
            parts.push(`bitmap ${value.length}x${Array.isArray(value[0]) ? value[0].length : 0}`);
        } else {
            parts.push(`${value.length} ${key}`);
        }
    }
    return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/** Build the live meta-block definition for one modeled field type. */
function fieldBlock(desc: FieldDescriptor) {
    const hasStructured = desc.structured.length > 0;
    return {
        init(this: FieldStateBlock): void {
            this.state_ = {};
            const input = this.appendDummyInput().appendField(desc.label);
            if (desc.hasName) {
                input.appendField('name').appendField(new Blockly.FieldTextInput(''), 'NAME');
            }
            for (const scalar of desc.scalars) {
                input.appendField(scalar.label);
                if (scalar.kind === 'bool') {
                    input.appendField(new Blockly.FieldCheckbox('FALSE'), scalar.field);
                } else {
                    input.appendField(new Blockly.FieldTextInput(''), scalar.field);
                }
            }
            if (hasStructured) {
                input.appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            }
            arg.call(this, `A ${desc.label} field (%N).`, CATEGORY_COLOUR.fields);
        },
        saveExtraState(this: FieldStateBlock): Record<string, unknown> {
            return this.state_ ?? {};
        },
        loadExtraState(this: FieldStateBlock, state: Record<string, unknown>): void {
            this.state_ = state ?? {};
            if (hasStructured) {
                this.setFieldValue(summarizeStructured(desc, this.state_), 'SUMMARY');
            }
        },
    };
}

/**
 * Alignment options shared by every input meta-block (`''` = default/omitted),
 * derived from the canonical {@link INPUT_ALIGN_VALUES} so the dropdown and the
 * importer's claim-set can't drift. Parser-accepted aliases outside this set
 * (e.g. `CENTER`) are preserved verbatim via the input's `rest` bag, not here.
 */
const ALIGN_OPTIONS: [string, string][] = [
    ['align —', ''],
    ...INPUT_ALIGN_VALUES.map(v => [`align ${v.toLowerCase()}`, v] as [string, string]),
];

/**
 * Build an input meta-block. All four input types share a `name` field and an
 * editable `align` dropdown; `value`/`statement` additionally get a `CHECK` slot
 * (a `connection_check` chain modeling the accepted types). `input_value` also gets
 * a `DEFAULT` field (`codegen.inputDefaults[name]`, co-located so it travels with a
 * rename — schema allows defaults only on value inputs). Any further unmodeled
 * attribute round-trips verbatim via the `state_.rest` bag; `state_.checkArray`
 * preserves a one-element `["String"]` check from collapsing to a scalar.
 */
function inputBlock(label: string, tooltip: string, hasCheck: boolean, hasDefault = false) {
    return {
        init(this: InputStateBlock): void {
            this.state_ = {};
            const row = this.appendDummyInput()
                .appendField(label)
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME')
                .appendField(new Blockly.FieldDropdown(ALIGN_OPTIONS), 'ALIGN');
            if (hasDefault) {
                row.appendField('default').appendField(new Blockly.FieldTextInput(''), 'DEFAULT');
            }
            if (hasCheck) {
                this.appendStatementInput('CHECK').setCheck(CHECK.CONNCHECK).appendField('accepts');
            }
            arg.call(this, tooltip, CATEGORY_COLOUR.inputs);
        },
        saveExtraState(this: InputStateBlock): Record<string, unknown> {
            return this.state_ ?? {};
        },
        loadExtraState(this: InputStateBlock, state: Record<string, unknown>): void {
            this.state_ = state ?? {};
        },
    };
}

export function defineArgBlocks(): void {
    Blockly.Blocks['input_value'] = inputBlock('value input', 'A value input socket (%N).', true, true);
    Blockly.Blocks['input_statement'] = inputBlock('statement input', 'A statement input socket (%N).', true);
    Blockly.Blocks['input_dummy'] = inputBlock('dummy input', 'A row with no socket.', false);
    Blockly.Blocks['input_end_row'] = inputBlock('end-row input', 'A row with no socket that ends the current row.', false);

    for (const desc of FIELD_DESCRIPTORS) {
        Blockly.Blocks[desc.type] = fieldBlock(desc);
    }

    Blockly.Blocks['field_generic'] = {
        init(this: GenericBlock): void {
            this.entry_ = undefined;
            this.appendDummyInput()
                .appendField('field')
                .appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            arg.call(this, 'A field type the guided editor does not model yet (preserved verbatim).', CATEGORY_COLOUR.fields);
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
