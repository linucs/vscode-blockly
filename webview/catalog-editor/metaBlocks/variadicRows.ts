import * as Blockly from 'blockly';
import { createMinusField, createPlusField } from '../../custom-fields/blocklyFieldHelpers';

/**
 * Shared `[+]`/`[−]` variadic-row machinery for meta-blocks (the catalog editor's
 * standard affordance — `implementation` targets, `dependency_brick` variables, and
 * the field-arg option/variable-type editors). Each row is a dynamically appended
 * dummy input named `${rowPrefix}${i}`; the count rides in `extraState` and is
 * rebuilt before fields are set on load ({@link renderSpec}).
 *
 * Reuse over duplication (plan §3a): one implementation, three consumers.
 */
export interface VariadicRowsConfig {
    /** Input id of the header row carrying the `[+]` (and, when rows exist, `[−]`) fields. */
    header: string;
    /** Prefix for each generated row input id, e.g. `OPT_ROW_`. */
    rowPrefix: string;
    /** Append this row's fields to the freshly created dummy input. */
    fillRow(input: Blockly.Input, index: number): void;
    /** Optional input id to keep the rows above (e.g. `DEPENDENCIES`). */
    anchorBefore?: string;
}

export interface VariadicRowsBlock extends Blockly.Block {
    rowCount_: number;
    plus(): void;
    minus(): void;
    addRow_(): void;
    removeRow_(): void;
    updateMinus_(): void;
}

/**
 * Mutate a Blockly block-definition object, adding the standard
 * `plus`/`minus`/`addRow_`/`removeRow_`/`updateMinus_` methods. The block's `init`
 * must create `cfg.header` (with a {@link createPlusField} named `PLUS`) and set
 * `this.rowCount_ = 0`; its `save`/`loadExtraState` persist/restore the count via
 * {@link rebuildRows}.
 */
export function installVariadicRows(def: Record<string, unknown>, cfg: VariadicRowsConfig): void {
    def.plus = function (this: VariadicRowsBlock): void {
        this.addRow_();
    };
    def.minus = function (this: VariadicRowsBlock): void {
        if (this.rowCount_ > 0) {
            this.removeRow_();
        }
    };
    def.addRow_ = function (this: VariadicRowsBlock): void {
        const i = this.rowCount_++;
        const input = this.appendDummyInput(`${cfg.rowPrefix}${i}`);
        cfg.fillRow(input, i);
        if (cfg.anchorBefore) {
            this.moveInputBefore(`${cfg.rowPrefix}${i}`, cfg.anchorBefore);
        }
        this.updateMinus_();
    };
    def.removeRow_ = function (this: VariadicRowsBlock): void {
        this.rowCount_--;
        this.removeInput(`${cfg.rowPrefix}${this.rowCount_}`);
        this.updateMinus_();
    };
    def.updateMinus_ = function (this: VariadicRowsBlock): void {
        const header = this.getInput(cfg.header)!;
        const hasMinus = Boolean(this.getField('MINUS'));
        if (!hasMinus && this.rowCount_ > 0) {
            header.insertFieldAt(1, createMinusField(), 'MINUS');
        } else if (hasMinus && this.rowCount_ <= 0) {
            (header as unknown as { removeField(n: string): void }).removeField('MINUS');
        }
    };
}

/** Clear all rows and the `[−]`, then add `count` fresh rows (for `loadExtraState`). */
export function rebuildRows(block: VariadicRowsBlock, cfg: VariadicRowsConfig, count: number): void {
    for (let i = 0; i < block.rowCount_; i++) {
        block.removeInput(`${cfg.rowPrefix}${i}`);
    }
    block.rowCount_ = 0;
    if (block.getField('MINUS')) {
        (block.getInput(cfg.header)! as unknown as { removeField(n: string): void }).removeField('MINUS');
    }
    for (let i = 0; i < count; i++) {
        block.addRow_();
    }
}

/** Convenience: the `[+]` field plus a label, the standard header content. */
export function appendVariadicHeader(block: Blockly.Block, headerInput: string, label: string): void {
    block.appendDummyInput(headerInput)
        .appendField(createPlusField(), 'PLUS')
        .appendField(label);
}
