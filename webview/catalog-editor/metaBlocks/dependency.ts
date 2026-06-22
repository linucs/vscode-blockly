import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';
import { appendVariadicHeader, installVariadicRows, rebuildRows, type VariadicRowsBlock, type VariadicRowsConfig } from './variadicRows';

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
        message0: 'library   name %1   minimum version %2',
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
        tooltip:
            'A library this code needs — from the PlatformIO registry or a Git repository. Give its name, ' +
            'and optionally a minimum version. "url" + "ref" point at a specific Git repo and branch/tag/commit.',
        helpUrl: '',
    },
    {
        type: 'dependency_pip',
        message0: 'pip package   name %1   minimum version %2',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
            { type: 'field_input', name: 'MINVERSION', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'A Python package this code needs, installed with pip. Give its name, and optionally a minimum version.',
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
const BRICK_ROWS: VariadicRowsConfig = {
    header: 'VARIABLES_HEADER',
    rowPrefix: 'VAR_ROW_',
    fillRow(input, i): void {
        input
            .appendField(new Blockly.FieldTextInput(''), `VARNAME${i}`)
            .appendField('=')
            .appendField(new Blockly.FieldTextInput(''), `VARVAL${i}`);
    },
};

let brickDefined = false;

export function defineDependencyBrickBlock(): void {
    if (brickDefined) {
        return;
    }
    brickDefined = true;

    const def: Record<string, unknown> = {
        init(this: VariadicRowsBlock): void {
            this.rowCount_ = 0;
            this.appendDummyInput('NAME_ROW')
                .appendField('brick   name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME');
            appendVariadicHeader(this, 'VARIABLES_HEADER', 'variables');
            this.setPreviousStatement(true, CHECK.DEPENDENCY);
            this.setNextStatement(true, CHECK.DEPENDENCY);
            this.setColour(60);
            this.setTooltip(
                'An Arduino App Lab "brick" this code needs. Use the + and − buttons to override its ' +
                'variables (each is a name → value pair).',
            );
        },
        saveExtraState(this: VariadicRowsBlock): object {
            return { varCount: this.rowCount_ };
        },
        loadExtraState(this: VariadicRowsBlock, state: { varCount?: number }): void {
            rebuildRows(this, BRICK_ROWS, state.varCount ?? 0);
        },
    };
    installVariadicRows(def, BRICK_ROWS);
    Blockly.Blocks['dependency_brick'] = def;
}
