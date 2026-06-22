import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';
import { createMinusField, createPlusField } from '../../custom-fields/blocklyFieldHelpers';

/**
 * The three `dependency_*` meta-blocks (library / pip / brick), discriminated by
 * block type. All three carry previous/next connections typed `CHECK.DEPENDENCY`,
 * so they only stack inside `implementation.DEPENDENCIES`. Each maps to one
 * branch of the schema's `Dependency` oneOf; the serializer reads the block type
 * to emit the `type:` discriminant.
 *
 * `library` and `pip` are static JSON. `brick` is defined imperatively (see
 * {@link defineDependencyBrickBlock}) so its `variables` (a string→string map of
 * brick-variable overrides — see the App Lab brick `brick_config.yaml`, where each
 * variable has a `name`/`default_value`) can be authored as a proper variadic
 * NAME → value row list via the standard `[+]`/`[−]` affordance, instead of a single
 * `k=v, k=v` text field.
 */
export const dependencyBlocks = [
    {
        type: 'dependency_library',
        message0: 'library   name %1   minVersion %2',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
            { type: 'field_input', name: 'MINVERSION', text: '' },
        ],
        message1: 'url %1   ref %2',
        args1: [
            { type: 'field_input', name: 'URL', text: '' },
            { type: 'field_input', name: 'REF', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'PlatformIO/registry or VCS library dependency.',
        helpUrl: '',
    },
    {
        type: 'dependency_pip',
        message0: 'pip   name %1   minVersion %2',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
            { type: 'field_input', name: 'MINVERSION', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'Python pip dependency.',
        helpUrl: '',
    },
];

/**
 * The `dependency_brick` meta-block. `variables` is a NAME → value map (brick
 * variable overrides), authored as a variadic row list with `[+]`/`[−]` — the same
 * mechanism as `implementation`'s targets. Each row is a `VARNAME{i}` = `VARVAL{i}`
 * pair; the serializer enumerates them. A row with an empty name is skipped; empty
 * values are kept (some brick variables legitimately default to `""`).
 */
interface BrickBlock extends Blockly.Block {
    varCount_: number;
    plus(): void;
    minus(): void;
    addVariable_(): void;
    removeVariable_(): void;
    updateMinus_(): void;
}

let brickDefined = false;

export function defineDependencyBrickBlock(): void {
    if (brickDefined) {
        return;
    }
    brickDefined = true;

    Blockly.Blocks['dependency_brick'] = {
        init(this: BrickBlock): void {
            this.varCount_ = 0;
            this.appendDummyInput('NAME_ROW')
                .appendField('brick   name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME');
            this.appendDummyInput('VARIABLES_HEADER')
                .appendField(createPlusField(), 'PLUS')
                .appendField('variables');
            this.setPreviousStatement(true, CHECK.DEPENDENCY);
            this.setNextStatement(true, CHECK.DEPENDENCY);
            this.setColour(60);
            this.setTooltip('App Lab brick dependency. Use [+]/[−] to set variable overrides (NAME → value).');
        },

        plus(this: BrickBlock): void {
            this.addVariable_();
        },

        minus(this: BrickBlock): void {
            if (this.varCount_ <= 0) {
                return;
            }
            this.removeVariable_();
        },

        addVariable_(this: BrickBlock): void {
            const i = this.varCount_++;
            this.appendDummyInput(`VAR_ROW_${i}`)
                .appendField(new Blockly.FieldTextInput(''), `VARNAME${i}`)
                .appendField('=')
                .appendField(new Blockly.FieldTextInput(''), `VARVAL${i}`);
            this.updateMinus_();
        },

        removeVariable_(this: BrickBlock): void {
            this.varCount_--;
            this.removeInput(`VAR_ROW_${this.varCount_}`);
            this.updateMinus_();
        },

        updateMinus_(this: BrickBlock): void {
            const header = this.getInput('VARIABLES_HEADER')!;
            const hasMinus = Boolean(this.getField('MINUS'));
            if (!hasMinus && this.varCount_ > 0) {
                header.insertFieldAt(1, createMinusField(), 'MINUS');
            } else if (hasMinus && this.varCount_ <= 0) {
                (header as unknown as { removeField(n: string): void }).removeField('MINUS');
            }
        },

        saveExtraState(this: BrickBlock): object {
            return { varCount: this.varCount_ };
        },

        loadExtraState(this: BrickBlock, state: { varCount?: number }): void {
            for (let i = 0; i < this.varCount_; i++) {
                this.removeInput(`VAR_ROW_${i}`);
            }
            this.varCount_ = 0;
            if (this.getField('MINUS')) {
                (this.getInput('VARIABLES_HEADER')! as unknown as { removeField(n: string): void }).removeField('MINUS');
            }
            const count = state.varCount ?? 0;
            for (let i = 0; i < count; i++) {
                this.addVariable_();
            }
        },
    };
}
