import * as Blockly from 'blockly';
import { FieldCombobox } from '../../custom-fields/FieldCombobox';
import { CATALOG_EXTENSIONS } from '../../blockFields';
import { CHECK } from '../connectionChecks';

/**
 * The `extension` meta-block — one Blockly block-`extension` name. The combobox is
 * seeded from {@link CATALOG_EXTENSIONS} (the single registry shared with the
 * runtime, so the preview applies exactly what the runtime registers) while still
 * accepting custom names. A chain of them inside `block_def.EXTENSIONS` serializes
 * to the `blockly.extensions` array.
 */
const PRESETS: [string, string][] = CATALOG_EXTENSIONS.map(name => [name, name]);

export function defineExtensionBlock(): void {
    Blockly.Blocks['extension'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('extension')
                .appendField(new FieldCombobox(PRESETS), 'VALUE');
            this.setPreviousStatement(true, CHECK.EXTENSION);
            this.setNextStatement(true, CHECK.EXTENSION);
            this.setColour(20);
            this.setTooltip('A Blockly block extension applied to this block.');
        },
    };
}
