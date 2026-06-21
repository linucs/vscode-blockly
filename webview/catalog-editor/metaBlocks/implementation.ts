import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';
import { listSupportedRuntimes } from '../../codegen/core/generatorRegistry';
import { FieldCombobox } from '../../custom-fields/FieldCombobox';
import { createMinusField, createPlusField } from '../../custom-fields/blocklyFieldHelpers';

/**
 * The `implementation` meta-block — one `<framework>:<language>` runtime with its
 * optional `targets` and `dependencies`. Defined imperatively (not as JSON) so the
 * `targets` list can use the project's standard variadic `[+]`/`[−]` affordance —
 * the same mechanism as `controls_switch_case` and the procedure blocks — instead
 * of a separate draggable block. Each target is a `TARGET{i}` text field; the
 * serializer enumerates them.
 *
 * `runtime` is a combobox seeded from {@link listSupportedRuntimes} — the single
 * source of truth in the generator registry, so a new framework/language only has
 * to be registered there to appear here (custom values are still accepted). Its
 * previous/next connections are typed `CHECK.IMPLEMENTATION`, so it only stacks
 * inside `catalog.IMPLEMENTATIONS`.
 *
 * M2 models runtime/targets/dependencies only; `blocks` and impl-level `codegen`
 * are M3 — files containing them are routed to the raw-text editor by the host gate.
 */
interface ImplementationBlock extends Blockly.Block {
    targetCount_: number;
    plus(): void;
    minus(): void;
    addTarget_(): void;
    removeTarget_(): void;
    updateMinus_(): void;
}

let defined = false;

export function defineImplementationBlock(): void {
    if (defined) {
        return;
    }
    defined = true;

    const runtimeOptions: [string, string][] = listSupportedRuntimes().map(r => [r, r]);

    Blockly.Blocks['implementation'] = {
        init(this: ImplementationBlock): void {
            this.targetCount_ = 0;

            this.appendDummyInput('RUNTIME_ROW')
                .appendField('implementation   runtime')
                .appendField(new FieldCombobox(runtimeOptions), 'RUNTIME');

            this.appendDummyInput('TARGETS_HEADER')
                .appendField(createPlusField(), 'PLUS')
                .appendField('targets');

            this.appendStatementInput('DEPENDENCIES')
                .setCheck(CHECK.DEPENDENCY)
                .appendField('dependencies');

            // Impl-level codegen sections (shared imports/declarations/etc.).
            this.appendStatementInput('IMPORTS').setCheck(CHECK.CODELINE).appendField('codegen imports');
            this.appendStatementInput('DECLARATIONS').setCheck(CHECK.CODELINE).appendField('codegen declarations');
            this.appendStatementInput('SETUP').setCheck(CHECK.CODELINE).appendField('codegen setup');
            this.appendStatementInput('CLEANUP').setCheck(CHECK.CODELINE).appendField('codegen cleanup');
            this.appendStatementInput('HELPERS').setCheck(CHECK.HELPER).appendField('codegen helpers');

            this.appendStatementInput('BLOCKS')
                .setCheck(CHECK.BLOCKDEF)
                .appendField('blocks');

            this.setPreviousStatement(true, CHECK.IMPLEMENTATION);
            this.setNextStatement(true, CHECK.IMPLEMENTATION);
            this.setColour(160);
            this.setTooltip('One <framework>:<language> implementation. Use [+]/[−] to manage targets.');
        },

        plus(this: ImplementationBlock): void {
            this.addTarget_();
        },

        minus(this: ImplementationBlock): void {
            if (this.targetCount_ <= 0) {
                return;
            }
            this.removeTarget_();
        },

        addTarget_(this: ImplementationBlock): void {
            const i = this.targetCount_++;
            this.appendDummyInput(`TARGET_ROW_${i}`)
                .appendField('target')
                .appendField(new Blockly.FieldTextInput(''), `TARGET${i}`);
            // Keep target rows above the dependencies/codegen/blocks slots.
            this.moveInputBefore(`TARGET_ROW_${i}`, 'DEPENDENCIES');
            this.updateMinus_();
        },

        removeTarget_(this: ImplementationBlock): void {
            this.targetCount_--;
            this.removeInput(`TARGET_ROW_${this.targetCount_}`);
            this.updateMinus_();
        },

        updateMinus_(this: ImplementationBlock): void {
            const header = this.getInput('TARGETS_HEADER')!;
            const hasMinus = Boolean(this.getField('MINUS'));
            if (!hasMinus && this.targetCount_ > 0) {
                header.insertFieldAt(1, createMinusField(), 'MINUS');
            } else if (hasMinus && this.targetCount_ <= 0) {
                (header as unknown as { removeField(n: string): void }).removeField('MINUS');
            }
        },

        saveExtraState(this: ImplementationBlock): object {
            return { targetCount: this.targetCount_ };
        },

        loadExtraState(this: ImplementationBlock, state: { targetCount?: number }): void {
            for (let i = 0; i < this.targetCount_; i++) {
                this.removeInput(`TARGET_ROW_${i}`);
            }
            this.targetCount_ = 0;
            if (this.getField('MINUS')) {
                (this.getInput('TARGETS_HEADER')! as unknown as { removeField(n: string): void }).removeField('MINUS');
            }

            const count = state.targetCount ?? 0;
            for (let i = 0; i < count; i++) {
                this.addTarget_();
            }
        },
    };
}
