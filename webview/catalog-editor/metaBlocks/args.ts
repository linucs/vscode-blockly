import * as Blockly from 'blockly';
import {
    FIELD_DESCRIPTORS,
    type FieldDescriptor,
} from '../../../src/catalog/serialize/fieldDescriptors';
import { INPUT_ALIGN_VALUES } from '../../../src/catalog/serialize/types';
import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';
import { FieldThemedBitmap } from '../../custom-fields/FieldThemedBitmap';
import {
    appendVariadicHeader, installVariadicRows, rebuildRows,
    type VariadicRowsBlock, type VariadicRowsConfig,
} from './variadicRows';

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
interface FieldStateBlock extends VariadicRowsBlock {
    state_: Record<string, unknown>;
    /** Guards the WIDTH/HEIGHT validators from recursing while we set them ourselves. */
    bitmapBusy_?: boolean;
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

/** Bitmap grid size bounds — keep a fat-fingered value from freezing the editor. */
const BITMAP_MIN = 1;
const BITMAP_MAX = 32;

/** Empty grid (all-off) of the given size; defaults to 8×8 for a fresh `field_bitmap`. */
function emptyBitmap(width = 8, height = 8): number[][] {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
}

/** Resize a grid to width×height, keeping overlapping pixels and zero-filling new cells. */
function resizeGrid(old: number[][], width: number, height: number): number[][] {
    return Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => old[r]?.[c] ?? 0));
}

/**
 * Swap a bitmap meta-block's grid field for a fresh one holding `grid`. `FieldBitmap`
 * builds its block display once at init and never rebuilds it when the value's
 * dimensions change, so a resize (or an import of a non-8×8 grid) means replacing the
 * whole field — `setValue` alone would render a broken grid.
 */
function setBitmapGrid(block: Blockly.Block, grid: number[][]): void {
    const input = block.getInput('HEADER');
    if (!input) {
        return;
    }
    if (block.getField('VALUE')) {
        input.removeField('VALUE');
    }
    input.appendField(new FieldThemedBitmap(grid), 'VALUE');
}

/** Row config for the inline `options` pairs editor (`label = value`). */
const OPTION_ROWS: VariadicRowsConfig = {
    header: 'STRUCT_HEADER',
    rowPrefix: 'OPT_ROW_',
    fillRow(input, i): void {
        input
            .appendField(new Blockly.FieldTextInput(''), `OPTLABEL${i}`)
            .appendField('=')
            .appendField(new Blockly.FieldTextInput(''), `OPTVAL${i}`);
    },
};

/** Row config for the inline `variableTypes` list editor (one type per row). */
const VARTYPE_ROWS: VariadicRowsConfig = {
    header: 'STRUCT_HEADER',
    rowPrefix: 'VTYPE_ROW_',
    fillRow(input, i): void {
        input.appendField(new Blockly.FieldTextInput(''), `VTYPE${i}`);
    },
};

/**
 * Build the live meta-block definition for one modeled field type. Scalars render as
 * editable fields (the M4 path). Structured leaf data is now editable per
 * `desc.structuredEditor`: `pairs`/`list` → inline `[+]/[−]` rows; `bitmap` → an
 * embedded themed grid with width/height controls. A `pairs` field whose options can't be expressed as
 * `[string,string]` rows (image labels) keeps the verbatim `optionsRaw` bag and shows
 * a read-only summary. Any structured key without an editor falls back to a summary
 * (defensive — all current ones have editors).
 */
function fieldBlock(desc: FieldDescriptor) {
    const editor = desc.structuredEditor;
    const rowCfg = editor === 'pairs' ? OPTION_ROWS : editor === 'list' ? VARTYPE_ROWS : null;
    const countKey = editor === 'pairs' ? 'optCount' : 'varTypeCount';
    const summaryOnly = desc.structured.length > 0 && !editor;

    const def: Record<string, unknown> = {
        init(this: FieldStateBlock): void {
            this.state_ = {};
            this.rowCount_ = 0;
            const input = this.appendDummyInput('HEADER').appendField(desc.label);
            if (desc.hasName) {
                input.appendField('name').appendField(new Blockly.FieldTextInput(''), 'NAME');
            }
            if (editor !== 'bitmap') {
                for (const scalar of desc.scalars) {
                    input.appendField(scalar.label);
                    input.appendField(
                        scalar.kind === 'bool' ? new Blockly.FieldCheckbox('FALSE') : new Blockly.FieldTextInput(''),
                        scalar.field,
                    );
                }
            }
            if (editor === 'bitmap') {
                const widthField = new Blockly.FieldNumber(8, BITMAP_MIN, BITMAP_MAX, 1);
                const heightField = new Blockly.FieldNumber(8, BITMAP_MIN, BITMAP_MAX, 1);
                input.appendField('size')
                    .appendField(widthField, 'WIDTH')
                    .appendField('×')
                    .appendField(heightField, 'HEIGHT')
                    .appendField(new FieldThemedBitmap(emptyBitmap()), 'VALUE');
                // Editing width/height rebuilds the grid at the new size (the field plugin
                // has no resize control of its own); the grid stays the single source —
                // serialize derives width/height from it. Guarded against our own writes.
                const block = this;
                const resizeTo = (width: number, height: number): void => {
                    const cur = (block.getFieldValue('VALUE') as number[][] | null) ?? [];
                    setBitmapGrid(block, resizeGrid(cur, width, height));
                };
                widthField.setValidator((value): number => {
                    const width = Number(value);
                    if (!block.bitmapBusy_) {
                        resizeTo(width, Number(block.getFieldValue('HEIGHT')));
                    }
                    return width;
                });
                heightField.setValidator((value): number => {
                    const height = Number(value);
                    if (!block.bitmapBusy_) {
                        resizeTo(Number(block.getFieldValue('WIDTH')), height);
                    }
                    return height;
                });
            } else if (rowCfg) {
                appendVariadicHeader(this, 'STRUCT_HEADER', editor === 'pairs' ? 'options' : 'variable types');
            } else if (summaryOnly) {
                input.appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            }
            arg.call(this, `A ${desc.label}. Write its %N in the message text to show where it appears.`, CATEGORY_COLOUR.fields);
        },

        saveExtraState(this: FieldStateBlock): Record<string, unknown> {
            const out: Record<string, unknown> = { ...this.state_ };
            if (editor === 'bitmap') {
                out.value = this.getFieldValue('VALUE');
            } else if (rowCfg && this.state_.optionsRaw === undefined) {
                out[countKey] = this.rowCount_;
            }
            return out;
        },

        loadExtraState(this: FieldStateBlock, state: Record<string, unknown>): void {
            this.state_ = state ?? {};
            if (editor === 'bitmap') {
                const grid = Array.isArray(this.state_.value)
                    ? (this.state_.value as number[][])
                    : emptyBitmap();
                // Rebuild the grid field at the loaded size, then mirror its dimensions
                // into WIDTH/HEIGHT without re-triggering their resize validators.
                this.bitmapBusy_ = true;
                setBitmapGrid(this, grid);
                this.setFieldValue(grid[0]?.length ?? 0, 'WIDTH');
                this.setFieldValue(grid.length, 'HEIGHT');
                this.bitmapBusy_ = false;
                return;
            }
            if (rowCfg) {
                if (this.state_.optionsRaw !== undefined) {
                    // Non-editable (e.g. image-label) options: drop the [+], show a summary.
                    rebuildRows(this, rowCfg, 0);
                    const header = this.getInput('STRUCT_HEADER')!;
                    if (this.getField('PLUS')) {
                        (header as unknown as { removeField(n: string): void }).removeField('PLUS');
                    }
                    if (!this.getField('SUMMARY')) {
                        header.appendField(new Blockly.FieldLabel(''), 'SUMMARY');
                    }
                    const raw = this.state_.optionsRaw as unknown[];
                    this.setFieldValue(`(${raw.length} options — edit as text)`, 'SUMMARY');
                } else {
                    rebuildRows(this, rowCfg, (this.state_[countKey] as number) ?? 0);
                }
                return;
            }
            if (summaryOnly) {
                this.setFieldValue(summarizeStructured(desc, this.state_), 'SUMMARY');
            }
        },
    };

    if (rowCfg) {
        installVariadicRows(def, rowCfg);
    }
    return def;
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
function inputBlock(label: string, tooltip: string, checkLabel: string | null, hasDefault = false) {
    return {
        init(this: InputStateBlock): void {
            this.state_ = {};
            const row = this.appendDummyInput()
                .appendField(label)
                .appendField('name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME')
                .appendField(new Blockly.FieldDropdown(ALIGN_OPTIONS), 'ALIGN');
            if (hasDefault) {
                row.appendField('default value').appendField(new Blockly.FieldTextInput(''), 'DEFAULT');
            }
            if (checkLabel) {
                this.appendStatementInput('CHECK').setCheck(CHECK.CONNCHECK).appendField(checkLabel);
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
    Blockly.Blocks['input_value'] = inputBlock(
        'value socket',
        'A socket where the user plugs in a value block. Write its %N in the message text to show where it appears.',
        'tags it accepts', true,
    );
    Blockly.Blocks['input_statement'] = inputBlock(
        'statement socket',
        'A C-shaped socket that holds a stack of blocks inside this one.',
        'tags it accepts inside',
    );
    Blockly.Blocks['input_dummy'] = inputBlock(
        'plain row',
        'A row with no socket — used to place fields or start a new line.',
        null,
    );
    Blockly.Blocks['input_end_row'] = inputBlock(
        'row break',
        'Ends the current row, so the fields after it start on a new line.',
        null,
    );

    for (const desc of FIELD_DESCRIPTORS) {
        Blockly.Blocks[desc.type] = fieldBlock(desc);
    }

    Blockly.Blocks['field_generic'] = {
        init(this: GenericBlock): void {
            this.entry_ = undefined;
            this.appendDummyInput()
                .appendField('unknown field')
                .appendField(new Blockly.FieldLabel(''), 'SUMMARY');
            arg.call(this, "A field type this editor doesn't know yet. It's kept exactly as-is so nothing is lost.", CATEGORY_COLOUR.fields);
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
