import * as Blockly from 'blockly';

/**
 * Shared logic for emitting per-block comments into generated source.
 *
 * Two independent behaviours:
 *  - A block's own comment (Blockly's comment bubble) is ALWAYS emitted — this
 *    mirrors Blockly's stock generators and is not gated by any setting.
 *  - The `blocks-editor.annotateGeneratedCode` setting, when on, additionally
 *    emits the block's TOOLTIP as a fallback for statements the user did not
 *    comment themselves.
 *
 * Both runtime generators (cpp and the hybrid python, which extends Blockly's
 * stock PythonGenerator) route their `scrub_` through `blockCommentPrefix` so
 * the behaviour — and the safety guard — stays identical; only the line-comment
 * token differs (`// ` vs `# `). The host pushes the current setting in via
 * `set_annotate`.
 */
let tooltipFallback = false;
let initialized = false;

/**
 * Set the tooltip-fallback flag. Returns true only when this call *changed* an
 * already-known value — the first call (the host's initial push on editor open)
 * returns false so it never forces a spurious regenerate-and-write of a file
 * just being opened.
 */
export function setCommentAnnotation(on: boolean): boolean {
    const changed = initialized && tooltipFallback !== on;
    tooltipFallback = on;
    initialized = true;
    return changed;
}

/**
 * Build the comment line(s) to prepend before a block's generated code, or '' if
 * nothing should be emitted. Considers only statement-position blocks (no output
 * connection) that actually emit code — never expression blocks (a comment inside
 * an inlined expression would break it) and never empty emitters like the section
 * containers (which would leave a dangling comment).
 *
 * The block's own comment is always used; the tooltip is used as a fallback only
 * when the tooltip-fallback setting is on and the user wrote no comment.
 *
 * @param lineComment the language's line-comment prefix, e.g. '// ' or '# '.
 */
export function blockCommentPrefix(
    block: Blockly.Block,
    code: string,
    generator: Blockly.CodeGenerator,
    lineComment: string,
): string {
    if (block.outputConnection || !code.trim()) return '';

    const user = block.getCommentText();
    let text = user && user.trim() ? user.trim() : '';
    if (!text && tooltipFallback) {
        const tip = Blockly.Tooltip.getTooltipOfObject(block);
        text = typeof tip === 'string' ? tip.trim() : '';
    }
    return text ? generator.prefixLines(text + '\n', lineComment) : '';
}
