import * as Blockly from 'blockly';
import { PRECEDENCE_VALUES } from '../../../src/catalog/serialize/types';
import { readI18n } from '../../../src/catalog/serialize/i18n';
import { CHECK } from '../connectionChecks';
import { FieldTranslate, type TranslatableBlock } from '../ui/FieldTranslate';
import { translationHooks } from '../ui/translationDialog';

/** Dropdown options for `precedence`: empty (statement → omitted) + the closed enum. */
const PRECEDENCE_OPTIONS: [string, string][] = [
    ['(none)', ''],
    ...PRECEDENCE_VALUES.map(v => [v, v] as [string, string]),
];

/**
 * The `block_def` meta-block — one Blockly block definition (design "Model A").
 * Editable fields: `TYPE`, `CONNECTIONS`, `INLINE`, `PRECEDENCE`, `STYLE`, `HELPURL`.
 * Statement slots: `MESSAGES` (the rendered rows), the codegen sections
 * (`BODY`/`SETUP`/`IMPORTS`/`DECLARATIONS`/`CLEANUP` as `code_line` chains,
 * `HELPERS`), `EXTENSIONS` (`extension` chain), and `RAW_PROPS` (catch-all attributes).
 *
 * The authored block's **connection shape** is data, not the meta-block's own wiring:
 * the `CONNECTIONS` dropdown (`NONE`/`LEFT`/`TOP`/`BOTTOM`/`BOTH`) picks which of
 * `output`/`previousStatement`/`nextStatement` the *defined* block has, and a dynamic
 * check slot (`OUTPUTCHECK`/`TOPCHECK`/`BOTTOMCHECK`, a `connection_check` chain) holds
 * each one's accepted types. (The meta-block's *own* prev/next stay `CHECK.BLOCKDEF`
 * so it keeps stacking inside `implementation.BLOCKS`.) A freshly dragged block
 * defaults to a statement (`BOTH`). Preserved-but-not-yet-editable attributes
 * (`tooltip`, `colour`, `tags`) and the verbatim fallback bags for out-of-enum
 * `precedence` (`precedenceRaw`) and non-string input defaults (`inputDefaultsRaw`)
 * live in `extraState`.
 */
interface BlockDefBlock extends Blockly.Block, TranslatableBlock {
    state_: Record<string, unknown>;
    updateShape_(connections: string): void;
}

const CHECK_SLOTS = ['OUTPUTCHECK', 'TOPCHECK', 'BOTTOMCHECK'] as const;

export function defineBlockDefBlock(): void {
    Blockly.Blocks['block_def'] = {
        init(this: BlockDefBlock): void {
            this.state_ = {};

            this.appendDummyInput()
                .appendField('block type')
                .appendField(new Blockly.FieldTextInput(''), 'TYPE');
            const connField = new Blockly.FieldDropdown([
                ['statement (top+bottom)', 'BOTH'],
                ['value (output)', 'LEFT'],
                ['top only', 'TOP'],
                ['bottom only', 'BOTTOM'],
                ['standalone (none)', 'NONE'],
            ]);
            this.appendDummyInput()
                .appendField('connections')
                .appendField(connField, 'CONNECTIONS');
            this.appendDummyInput()
                .appendField('inline')
                .appendField(new Blockly.FieldDropdown([['auto', 'unset'], ['yes', 'true'], ['no', 'false']]), 'INLINE')
                .appendField('precedence')
                // Closed 9-value enum (schema `CodegenPrecedence`) + an empty option
                // (statement block → omitted on serialize). A parser-accepted but
                // out-of-enum value is preserved verbatim via `extraState.precedenceRaw`
                // (the importer leaves the dropdown empty), so the closed set never
                // drops it. "Required when output is set" is a non-blocking validation
                // message (§5d), not a gate.
                .appendField(new Blockly.FieldDropdown(PRECEDENCE_OPTIONS), 'PRECEDENCE');

            this.appendStatementInput('MESSAGES').setCheck(CHECK.MSGROW).appendField('message rows');
            this.appendStatementInput('BODY').setCheck(CHECK.CODELINE).appendField('code (body)');
            this.appendStatementInput('SETUP').setCheck(CHECK.CODELINE).appendField('setup');
            this.appendStatementInput('IMPORTS').setCheck(CHECK.CODELINE).appendField('imports');
            this.appendStatementInput('DECLARATIONS').setCheck(CHECK.CODELINE).appendField('declarations');
            this.appendStatementInput('CLEANUP').setCheck(CHECK.CODELINE).appendField('cleanup');
            this.appendStatementInput('HELPERS').setCheck(CHECK.HELPER).appendField('helpers');

            this.appendDummyInput()
                .appendField('style')
                .appendField(new Blockly.FieldTextInput(''), 'STYLE')
                .appendField('helpUrl')
                .appendField(new Blockly.FieldTextInput(''), 'HELPURL')
                .appendField('tooltip')
                .appendField(new FieldTranslate(), 'TOOLTIP_TR');
            this.appendStatementInput('EXTENSIONS').setCheck(CHECK.EXTENSION).appendField('extensions');
            this.appendStatementInput('RAW_PROPS').setCheck(CHECK.RAWPROP).appendField('extra blockly props');

            this.setPreviousStatement(true, CHECK.BLOCKDEF);
            this.setNextStatement(true, CHECK.BLOCKDEF);
            this.setColour(290);
            this.setTooltip('One Blockly block definition. Stacks inside an implementation.');

            // Build the default (statement) check slots, then reconfigure live on change.
            this.updateShape_(this.getFieldValue('CONNECTIONS') ?? 'BOTH');
            connField.setValidator((value?: string) => {
                this.updateShape_(value ?? 'BOTH');
                return undefined;
            });
        },

        /**
         * Add/remove the per-connection check slots to match the chosen shape,
         * keeping them just above `MESSAGES`. Existing slots (and any blocks in
         * them) are cleared first, so switching shape is idempotent. Only the
         * authored block's data shape changes here — never the meta-block's own
         * `CHECK.BLOCKDEF` connections.
         */
        updateShape_(this: BlockDefBlock, connections: string): void {
            for (const slot of CHECK_SLOTS) {
                if (this.getInput(slot)) {
                    this.removeInput(slot);
                }
            }
            const slots: [boolean, string, string][] = [
                [connections === 'LEFT', 'OUTPUTCHECK', 'output accepts'],
                [connections === 'TOP' || connections === 'BOTH', 'TOPCHECK', 'top accepts'],
                [connections === 'BOTTOM' || connections === 'BOTH', 'BOTTOMCHECK', 'bottom accepts'],
            ];
            for (const [want, name, label] of slots) {
                if (want) {
                    this.appendStatementInput(name).setCheck(CHECK.CONNCHECK).appendField(label);
                    this.moveInputBefore(name, 'MESSAGES');
                }
            }
        },

        saveExtraState(this: BlockDefBlock): Record<string, unknown> {
            // `connections` lets Blockly's own (de)serialization rebuild the dynamic
            // slots; the serializer reads the CONNECTIONS field directly and ignores it.
            return { ...this.state_, connections: this.getFieldValue('CONNECTIONS') };
        },

        loadExtraState(this: BlockDefBlock, state: Record<string, unknown>): void {
            this.state_ = state ?? {};
            this.updateShape_((this.state_.connections as string) ?? 'BOTH');
        },

        // Tooltip is dialog-only (no inline field) — the 🌐 is its sole editor.
        ...translationHooks<BlockDefBlock>({
            get() {
                return readI18n(this.state_.tooltip);
            },
            set(next) {
                this.state_.tooltip = next === '' ? undefined : next;
            },
        }),
    };
}
