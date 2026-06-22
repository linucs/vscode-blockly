import * as Blockly from 'blockly';
import { PRECEDENCE_VALUES } from '../../../src/catalog/serialize/types';
import { readI18n } from '../../../src/catalog/serialize/i18n';
import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';
import { FieldTranslate, type TranslatableBlock } from '../ui/FieldTranslate';
import { translationHooks } from '../ui/translationDialog';

/** Dropdown options for `precedence`: empty (statement → omitted) + the closed enum. */
const PRECEDENCE_OPTIONS: [string, string][] = [
    ['(none)', ''],
    ...PRECEDENCE_VALUES.map(v => [v, v] as [string, string]),
];

/**
 * The `block_def` meta-block — one Blockly block definition (design "Model A").
 * Editable fields: `TYPE`, `CONNECTIONS`, `INLINE`, `PRECEDENCE`, `HELPURL`.
 * Statement slots: `MESSAGES` (the rendered rows), the codegen sections
 * (`BODY`/`SETUP`/`IMPORTS`/`DECLARATIONS`/`CLEANUP` as `code_snippet` chains,
 * `HELPERS`) and `EXTENSIONS` (`extension` chain). Any unmodeled top-level `blockly`
 * attribute rides verbatim in `extraState.rawProps` (non-positional metadata, no
 * visible block — alongside `style`/`tags`/`precedenceRaw`/`inputDefaultsRaw`).
 *
 * The authored block's **connection shape** is data, not the meta-block's own wiring:
 * the `CONNECTIONS` dropdown (`NONE`/`LEFT`/`TOP`/`BOTTOM`/`BOTH`) picks which of
 * `output`/`previousStatement`/`nextStatement` the *defined* block has, and a dynamic
 * check slot (`OUTPUTCHECK`/`TOPCHECK`/`BOTTOMCHECK`, a `connection_check` chain) holds
 * each one's accepted types. (The meta-block's *own* prev/next stay `CHECK.BLOCKDEF`
 * so it keeps stacking inside `implementation.BLOCKS`.) A freshly dragged block
 * defaults to a statement (`BOTH`). `tooltip` is edited via the translation dialog;
 * `colour`, `style` and `tags` are preserved verbatim (not exposed as choices —
 * `style` overlaps confusingly with `colour`), as are the verbatim fallback bags for
 * out-of-enum `precedence` (`precedenceRaw`) and non-string input defaults
 * (`inputDefaultsRaw`). All live in `extraState`.
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
                .appendField('block id')
                .appendField(new Blockly.FieldTextInput(''), 'TYPE');
            const connField = new Blockly.FieldDropdown([
                ['statement — connects above and below', 'BOTH'],
                ['value — plugs into another block', 'LEFT'],
                ['connects above only', 'TOP'],
                ['connects below only', 'BOTTOM'],
                ['standalone — no connections', 'NONE'],
            ]);
            this.appendDummyInput()
                .appendField('how it connects')
                .appendField(connField, 'CONNECTIONS');
            this.appendDummyInput()
                .appendField('inline inputs')
                .appendField(new Blockly.FieldDropdown([['auto', 'unset'], ['yes', 'true'], ['no', 'false']]), 'INLINE')
                .appendField('precedence (for value blocks)')
                // Closed 9-value enum (schema `CodegenPrecedence`) + an empty option
                // (statement block → omitted on serialize). A parser-accepted but
                // out-of-enum value is preserved verbatim via `extraState.precedenceRaw`
                // (the importer leaves the dropdown empty), so the closed set never
                // drops it. "Required when output is set" is a non-blocking validation
                // message (§5d), not a gate.
                .appendField(new Blockly.FieldDropdown(PRECEDENCE_OPTIONS), 'PRECEDENCE');

            this.appendDummyInput('MESSAGES_LABEL').appendField('rows shown on the block');
            this.appendStatementInput('MESSAGES').setCheck(CHECK.MSGROW);
            this.appendStatementInput('BODY').setCheck(CHECK.CODESNIPPET).appendField('code — main body');
            this.appendStatementInput('SETUP').setCheck(CHECK.CODESNIPPET).appendField('code — setup');
            this.appendStatementInput('IMPORTS').setCheck(CHECK.CODESNIPPET).appendField('code — imports');
            this.appendStatementInput('DECLARATIONS').setCheck(CHECK.CODESNIPPET).appendField('code — declarations');
            this.appendStatementInput('CLEANUP').setCheck(CHECK.CODESNIPPET).appendField('code — cleanup');
            this.appendStatementInput('HELPERS').setCheck(CHECK.HELPER).appendField('helper functions');

            this.appendDummyInput()
                .appendField('help url')
                .appendField(new Blockly.FieldTextInput(''), 'HELPURL')
                .appendField('tooltip')
                .appendField(new FieldTranslate(), 'TOOLTIP_TR');
            this.appendStatementInput('EXTENSIONS').setCheck(CHECK.EXTENSION).appendField('extensions');

            this.setPreviousStatement(true, CHECK.BLOCKDEF);
            this.setNextStatement(true, CHECK.BLOCKDEF);
            this.setColour(CATEGORY_COLOUR.block);
            this.setTooltip(
                'This is one block people will drag into their program. Give it an id, choose how it connects ' +
                'to other blocks, lay out the text it shows, and write the code it generates. Everything below ' +
                'the text rows is optional.',
            );

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
                [connections === 'LEFT', 'OUTPUTCHECK', 'tags this block has'],
                [connections === 'TOP' || connections === 'BOTH', 'TOPCHECK', 'tags this block has'],
                [connections === 'BOTTOM' || connections === 'BOTH', 'BOTTOMCHECK', 'tags it accepts below'],
            ];
            for (const [want, name, label] of slots) {
                if (want) {
                    this.appendStatementInput(name).setCheck(CHECK.CONNCHECK).appendField(label);
                    this.moveInputBefore(name, 'MESSAGES_LABEL');
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

        // Tooltip is dialog-only (no inline field) — the 文A is its sole editor.
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
