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
                .appendField('matching tag')
                .appendField(new FieldCombobox(PRESETS), 'VALUE');
            this.setPreviousStatement(true, CHECK.CONNCHECK);
            this.setNextStatement(true, CHECK.CONNCHECK);
            this.setColour(120);
            this.setTooltip(
                'A matching tag for this connection. Two connections join only if they share at least one tag — ' +
                'or if a side has no tag, meaning it joins anything. Common tags for value plugs are Number, ' +
                'String, Boolean and Array, but a tag is just a name you can invent. Stack several here to allow ' +
                'any of them.',
            );
        },
    };
}
