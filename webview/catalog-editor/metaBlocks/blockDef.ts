import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';

/**
 * The `block_def` meta-block — one Blockly block definition (design "Model A").
 * Editable fields: `TYPE`, `INLINE`, `PRECEDENCE` (value blocks), `HELPURL`.
 * Statement slots: `MESSAGES` (the rendered rows), the codegen sections
 * (`BODY`/`SETUP`/`IMPORTS`/`DECLARATIONS`/`CLEANUP` as `code_line` chains,
 * `HELPERS`), and `RAW_PROPS` (catch-all attributes).
 *
 * The connection **shape** (`output`/`previousStatement`/`nextStatement` with their
 * check values) and other preserved-but-not-yet-editable attributes (`tooltip`,
 * `colour`, `style`, `extensions`, `tags`, `inputDefaults`) live verbatim in
 * `extraState`, so they round-trip exactly. A freshly dragged block defaults to a
 * statement; editing an imported block keeps its exact shape. (Switching shape via
 * the UI and a full translation editor are later milestones.)
 */
interface BlockDefBlock extends Blockly.Block {
    state_: Record<string, unknown>;
}

export function defineBlockDefBlock(): void {
    Blockly.Blocks['block_def'] = {
        init(this: BlockDefBlock): void {
            this.state_ = { previousStatement: null, nextStatement: null };

            this.appendDummyInput()
                .appendField('block type')
                .appendField(new Blockly.FieldTextInput(''), 'TYPE');
            this.appendDummyInput()
                .appendField('inline')
                .appendField(new Blockly.FieldDropdown([['auto', 'unset'], ['yes', 'true'], ['no', 'false']]), 'INLINE')
                .appendField('precedence')
                // PRECEDENCE is a closed 9-value enum in the schema (ATOMIC … NONE),
                // but stays free text for now: the constrained dropdown + the
                // "required when blockly.output is set" conditional land together in
                // M6. An out-of-enum value is caught as a (non-blocking) validation
                // message meanwhile; an empty value is omitted on serialize.
                .appendField(new Blockly.FieldTextInput(''), 'PRECEDENCE');

            this.appendStatementInput('MESSAGES').setCheck(CHECK.MSGROW).appendField('message rows');
            this.appendStatementInput('BODY').setCheck(CHECK.CODELINE).appendField('code (body)');
            this.appendStatementInput('SETUP').setCheck(CHECK.CODELINE).appendField('setup');
            this.appendStatementInput('IMPORTS').setCheck(CHECK.CODELINE).appendField('imports');
            this.appendStatementInput('DECLARATIONS').setCheck(CHECK.CODELINE).appendField('declarations');
            this.appendStatementInput('CLEANUP').setCheck(CHECK.CODELINE).appendField('cleanup');
            this.appendStatementInput('HELPERS').setCheck(CHECK.HELPER).appendField('helpers');

            this.appendDummyInput()
                .appendField('helpUrl')
                .appendField(new Blockly.FieldTextInput(''), 'HELPURL');
            this.appendStatementInput('RAW_PROPS').setCheck(CHECK.RAWPROP).appendField('extra blockly props');

            this.setPreviousStatement(true, CHECK.BLOCKDEF);
            this.setNextStatement(true, CHECK.BLOCKDEF);
            this.setColour(290);
            this.setTooltip('One Blockly block definition. Stacks inside an implementation.');
        },

        saveExtraState(this: BlockDefBlock): Record<string, unknown> {
            return this.state_;
        },

        loadExtraState(this: BlockDefBlock, state: Record<string, unknown>): void {
            this.state_ = state ?? {};
        },
    };
}
