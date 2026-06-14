import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import { defineSwitchCaseBlock } from '../shared/blockDefs';

/**
 * Reserved words for the `python` language profile. Blockly's PythonGenerator
 * already registers the full Python keyword set on the generator; we add only
 * `App`, which `assembleScript` always imports (`from arduino.app_utils import
 * App`) and must not be shadowed by a user variable.
 */
export const PYTHON_KEYWORDS = ['App'];

/**
 * Install Python's L1 block generators onto the runtime's generator (axis 1).
 *
 * Unlike C++ (which has no stock Blockly generator and hand-writes every L1
 * handler), Python's primitives — logic/loops/math/text/lists/variables/
 * functions — come from Blockly's bundled `PythonGenerator`. Its handlers are
 * attached to the exported `pythonGenerator` singleton by side-effect at module
 * load, NOT in the `CodeGenerator` constructor, so a fresh subclass instance
 * starts with an empty `forBlock`. We copy the handler refs onto the active
 * generator without mutating the singleton.
 *
 * On top of the stock handlers we install the shared `controls_switch_case`
 * block's Python generator (match/case, Python 3.10+) — the block definition is
 * shared (`languages/shared/blockDefs.ts`); only the codegen differs from C++.
 */
export function registerPythonLanguageBlocks(generator: Blockly.CodeGenerator): void {
    defineSwitchCaseBlock();

    Object.assign(generator.forBlock, pythonGenerator.forBlock);

    generator.forBlock['controls_switch_case'] = (block, gen): string => {
        const INDENT = gen.INDENT;
        const PASS = (gen as unknown as { PASS: string }).PASS ?? 'pass';
        const expr = gen.valueToCode(block, 'SWITCH_EXPR', 0) || '0';
        const reindent = (code: string): string =>
            code.split('\n').map(l => (l ? INDENT + l : l)).join('\n');

        let code = `match ${expr}:\n`;
        for (let i = 0; block.getInput(`CASE_${i}_VAL`); i++) {
            const val = gen.valueToCode(block, `CASE_${i}_VAL`, 0) || '0';
            const body = gen.statementToCode(block, `CASE_${i}_BODY`) || `${INDENT}${PASS}\n`;
            code += `${INDENT}case ${val}:\n`;
            code += reindent(body);
        }
        const defaultBody = gen.statementToCode(block, 'DEFAULT_BODY');
        if (defaultBody) {
            code += `${INDENT}case _:\n`;
            code += reindent(defaultBody);
        }
        return code;
    };
}
