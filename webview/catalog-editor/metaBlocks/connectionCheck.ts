import * as Blockly from 'blockly';
import { FieldCombobox } from '../../custom-fields/FieldCombobox';
import { CHECK } from '../connectionChecks';

/**
 * The `connection_check` meta-block — one accepted connection-`check` type string.
 * A `FieldCombobox` offers the common presets (`any` = no constraint, plus the core
 * Blockly types) while still accepting any custom type name. Stacking several builds
 * the AND-list a connection accepts; the serializer reads the chain (empty → `null`,
 * one → a string, many → a `string[]`). Used in `block_def`'s shape check slots and
 * value/statement inputs' `CHECK` slot.
 */
const PRESETS: [string, string][] = [
    ['any', ''],
    ['Boolean', 'Boolean'],
    ['Number', 'Number'],
    ['String', 'String'],
    ['Array', 'Array'],
];

export function defineConnectionCheckBlock(): void {
    Blockly.Blocks['connection_check'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('accepts')
                .appendField(new FieldCombobox(PRESETS), 'VALUE');
            this.setPreviousStatement(true, CHECK.CONNCHECK);
            this.setNextStatement(true, CHECK.CONNCHECK);
            this.setColour(120);
            this.setTooltip('One accepted connection type. Stack several for an "any of" list; leave "any" for no constraint.');
        },
    };
}
