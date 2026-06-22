import * as Blockly from 'blockly';
import { CHECK } from '../connectionChecks';
import { listSupportedRuntimes } from '../../codegen/core/generatorRegistry';
import { FieldCombobox } from '../../custom-fields/FieldCombobox';
import { appendVariadicHeader, installVariadicRows, rebuildRows, type VariadicRowsBlock, type VariadicRowsConfig } from './variadicRows';

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
let defined = false;

// Target rows live above the dependencies slot; each is a single `TARGET{i}` field.
const TARGET_ROWS: VariadicRowsConfig = {
    header: 'TARGETS_HEADER',
    rowPrefix: 'TARGET_ROW_',
    anchorBefore: 'DEPENDENCIES',
    fillRow(input, i): void {
        input.appendField('target').appendField(new Blockly.FieldTextInput(''), `TARGET${i}`);
    },
};

export function defineImplementationBlock(): void {
    if (defined) {
        return;
    }
    defined = true;

    const runtimeOptions: [string, string][] = listSupportedRuntimes().map(r => [r, r]);

    const def: Record<string, unknown> = {
        init(this: VariadicRowsBlock): void {
            this.rowCount_ = 0;

            this.appendDummyInput('RUNTIME_ROW')
                .appendField('implementation   runtime')
                .appendField(new FieldCombobox(runtimeOptions), 'RUNTIME');

            appendVariadicHeader(this, 'TARGETS_HEADER', 'targets');

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
            this.setColour(330);
            this.setTooltip('One <framework>:<language> implementation. Use [+]/[−] to manage targets.');
        },
        saveExtraState(this: VariadicRowsBlock): object {
            return { targetCount: this.rowCount_ };
        },
        loadExtraState(this: VariadicRowsBlock, state: { targetCount?: number }): void {
            rebuildRows(this, TARGET_ROWS, state.targetCount ?? 0);
        },
    };
    installVariadicRows(def, TARGET_ROWS);
    Blockly.Blocks['implementation'] = def;
}
