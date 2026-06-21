import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';
import { i18nMerge, type I18nText } from '../../../src/catalog/serialize/i18n';

/**
 * The `message_row` meta-block — one rendered row of a block (one `message{N}`).
 * The `TEXT` field edits the primary locale (`en`); the full i18n value (other
 * locales) and the `args{N}`-presence flag are preserved in `extraState` and
 * folded back on save ({@link i18nMerge}), so translations round-trip untouched.
 * The `ARGS` slot holds the row's arg blocks (one per `%N`).
 */
interface MessageRowBlock extends Blockly.Block {
    text_: I18nText | undefined;
    hasArgs_: boolean;
}

export function defineMessageRowBlock(): void {
    Blockly.Blocks['message_row'] = {
        init(this: MessageRowBlock): void {
            this.text_ = undefined;
            this.hasArgs_ = false;
            this.appendDummyInput()
                .appendField('message')
                .appendField(new Blockly.FieldTextInput(''), 'TEXT');
            this.appendStatementInput('ARGS').setCheck(CHECK.ARG).appendField('args');
            this.setPreviousStatement(true, CHECK.MSGROW);
            this.setNextStatement(true, CHECK.MSGROW);
            this.setColour(250);
            this.setTooltip('One message row. Use %1, %2… for its args, in order.');
        },

        saveExtraState(this: MessageRowBlock): Record<string, unknown> {
            const edited = this.getFieldValue('TEXT') ?? '';
            return { text: i18nMerge(this.text_, edited), hasArgs: this.hasArgs_ };
        },

        loadExtraState(this: MessageRowBlock, state: { text?: I18nText; hasArgs?: boolean }): void {
            this.text_ = state?.text;
            this.hasArgs_ = state?.hasArgs ?? false;
        },
    };
}
