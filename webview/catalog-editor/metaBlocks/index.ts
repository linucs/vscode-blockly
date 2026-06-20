import * as Blockly from 'blockly';
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import { registerFieldColour } from '@blockly/field-colour';
import { catalogBlock } from './catalog';
import { defineImplementationBlock } from './implementation';
import { dependencyBlocks } from './dependency';
import { docLinkBlock } from './docLink';

/**
 * Registers the catalog-editor meta-blocks (defined in TypeScript, not as YAML
 * catalogs — design §5a) exactly once, and exposes the editor toolbox. These are
 * authoring tools, distinct from the user-facing catalog blocks rendered by the
 * main editor; they live in their own type namespace so the two never collide.
 *
 * `implementation` is defined imperatively (variadic `[+]/[−]` targets); the rest
 * are static JSON definitions.
 */

let registered = false;

export function registerMetaBlocks(): void {
    if (registered) {
        return;
    }
    // The `catalog` block uses `field_multilinetext` (description) and
    // `field_colour` (colour). Both are registered in plugins.ts too, but those
    // calls come from `sideEffects:false` packages and get tree-shaken when this
    // bundle imports plugins only for `pluginInjectOptions` — so register them
    // explicitly on this used path.
    registerFieldMultilineInput();
    registerFieldColour();

    Blockly.common.defineBlocksWithJsonArray([
        catalogBlock,
        docLinkBlock,
        ...dependencyBlocks,
    ]);
    defineImplementationBlock();
    registered = true;
}

/** Flyout toolbox offering every meta-block. */
export const META_TOOLBOX = {
    kind: 'flyoutToolbox',
    contents: [
        { kind: 'block', type: 'catalog' },
        { kind: 'block', type: 'implementation' },
        { kind: 'block', type: 'doc_link' },
        { kind: 'block', type: 'dependency_library' },
        { kind: 'block', type: 'dependency_pip' },
        { kind: 'block', type: 'dependency_brick' },
    ],
};
