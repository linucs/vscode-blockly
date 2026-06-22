import * as Blockly from 'blockly';
import { FieldCode } from '../../custom-fields/FieldCode';
import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';

/**
 * Codegen meta-blocks:
 * - `code_snippet` — one entry of generated code (a `body`/`setup`/`imports`/…
 *   item; may span several lines).
 * - `helper` — one named helper function (`helpers[name] = body`).
 *
 * (Unknown top-level `blockly` attributes are not a block — they ride verbatim in
 * `block_def`'s `extraState.rawProps`; see {@link ./blockDef}.)
 */
export function defineCodegenBlocks(): void {
    Blockly.Blocks['code_snippet'] = {
        init(this: Blockly.Block): void {
            // Multiline: a single codegen entry may contain newlines (e.g. a Python
            // `def …:\n  …`); a single-line field would strip them and break round-trip.
            // FieldCode = truncated preview + monospace modal (comfortable for code).
            this.appendDummyInput()
                .appendField(new FieldCode(''), 'TEXT');
            this.setPreviousStatement(true, CHECK.CODESNIPPET);
            this.setNextStatement(true, CHECK.CODESNIPPET);
            this.setColour(CATEGORY_COLOUR.codegen);
            this.setTooltip('One piece of generated code — a snippet that can span several lines. Type {{NAME}} where a field or input\'s value should be inserted.');
        },
    };

    Blockly.Blocks['helper'] = {
        init(this: Blockly.Block): void {
            this.appendDummyInput()
                .appendField('function name')
                .appendField(new Blockly.FieldTextInput(''), 'NAME');
            // Helper bodies are multi-line functions — preserve newlines.
            this.appendDummyInput()
                .appendField('body')
                .appendField(new FieldCode(''), 'BODY');
            this.setPreviousStatement(true, CHECK.HELPER);
            this.setNextStatement(true, CHECK.HELPER);
            this.setColour(CATEGORY_COLOUR.codegen);
            this.setTooltip('A reusable function the generated code can call. Give it a name and write what it does.');
        },
    };
}
