import * as Blockly from 'blockly';
import { registerFieldMultilineInput } from '@blockly/field-multilineinput';
import { registerFieldColour } from '@blockly/field-colour';
import { i18nDisplay, i18nMerge, isI18nMap, type I18nText } from '../../../src/catalog/serialize/i18n';
import { FIELD_DESCRIPTORS } from '../../../src/catalog/serialize/fieldDescriptors';
import { CATEGORY_COLOUR } from './categories';
import { type TranslatableBlock } from '../ui/FieldTranslate';
import { translationHooks } from '../ui/translationDialog';
import { catalogBlock } from './catalog';
import { defineImplementationBlock } from './implementation';
import { dependencyBlocks, defineDependencyBrickBlock } from './dependency';
import { docLinkBlock } from './docLink';
import { defineBlockDefBlock } from './blockDef';
import { defineMessageRowBlock } from './messageRow';
import { defineArgBlocks } from './args';
import { defineCodegenBlocks } from './codegen';
import { defineConnectionCheckBlock } from './connectionCheck';
import { defineExtensionBlock } from './extension';

/**
 * Registers the catalog-editor meta-blocks (defined in TypeScript, not as YAML
 * catalogs — design §5a) exactly once, and exposes the editor toolbox. These are
 * authoring tools, distinct from the user-facing catalog blocks rendered by the
 * main editor; they live in their own type namespace so the two never collide.
 *
 * `implementation` and the M3 block-authoring blocks are defined imperatively
 * (slots, conditional/structured state); the rest are static JSON definitions.
 */

let registered = false;

interface CatalogStateBlock extends Blockly.Block, TranslatableBlock {
    descState_?: I18nText;
    colourState_?: string;
    colourPresent_?: boolean;
}

/** The catalog description's current value: the stored map (if any) with the inline edit folded in, else the scalar field. */
function currentDescription(block: CatalogStateBlock): I18nText | undefined {
    const edited = block.getFieldValue('DESCRIPTION') ?? '';
    if (block.descState_ && typeof block.descState_ === 'object') {
        return i18nMerge(block.descState_, edited);
    }
    return edited || undefined;
}

/** The `field_colour` default (see catalog.ts) — a file with no `colour` shows this. */
const CATALOG_DEFAULT_COLOUR = '#5b80a5';

/**
 * Adds extraState round-trip to the JSON-defined `catalog` block by assigning
 * `save`/`loadExtraState` directly onto its definition (the same pattern the
 * imperative `implementation` block uses — a non-mutator `Extensions.register` may
 * not add these). It preserves two things the plain fields would lose:
 * - an i18n-map `description`'s non-primary locales (the field edits `en`), and
 * - the authored hex *case* of `colour` (field_colour lowercases it), kept as long
 *   as the picker value hasn't actually changed.
 */
function augmentCatalogState(): void {
    const def = Blockly.Blocks['catalog'] as Record<string, unknown>;
    def.saveExtraState = function (this: CatalogStateBlock): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        const editedDesc = this.getFieldValue('DESCRIPTION') ?? '';
        if (this.descState_ && typeof this.descState_ === 'object') {
            out.description = i18nMerge(this.descState_, editedDesc);
        }
        const colour = this.getFieldValue('COLOUR');
        // `field_colour` can't be empty (defaults to CATALOG_DEFAULT_COLOUR), so a
        // file with no `colour` would otherwise gain one from the field default and
        // fail the round-trip self-check. Emit colour only when it was authored on
        // disk, or the user picked a non-default colour.
        const authored = this.colourPresent_ === true;
        if (colour && (authored || colour.toLowerCase() !== CATALOG_DEFAULT_COLOUR)) {
            out.colour = (typeof this.colourState_ === 'string' && colour.toLowerCase() === this.colourState_.toLowerCase())
                ? this.colourState_
                : colour;
        }
        return out;
    };
    def.loadExtraState = function (this: CatalogStateBlock, state: { description?: I18nText; colour?: string }): void {
        this.descState_ = state?.description;
        this.colourState_ = state?.colour;
        this.colourPresent_ = state?.colour !== undefined;
    };
    // The 文A (DESC_TR) field edits the full description locale map; the inline
    // DESCRIPTION field stays the quick editor for the primary locale.
    Object.assign(def, translationHooks<CatalogStateBlock>({
        get() {
            return currentDescription(this);
        },
        set(next) {
            if (isI18nMap(next)) {
                this.descState_ = next;
                this.setFieldValue(i18nDisplay(next), 'DESCRIPTION');
            } else {
                // A single language always serializes as a scalar (no locale tag).
                this.descState_ = undefined;
                this.setFieldValue(typeof next === 'string' ? next : '', 'DESCRIPTION');
            }
        },
    }));
}

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
    augmentCatalogState();
    defineDependencyBrickBlock();
    defineImplementationBlock();
    defineBlockDefBlock();
    defineMessageRowBlock();
    defineArgBlocks();
    defineCodegenBlocks();
    defineConnectionCheckBlock();
    defineExtensionBlock();
    registered = true;
}

/**
 * Categorized toolbox offering every meta-block. The flat flyout grew crowded once
 * the 19 field blocks landed (M4), so the palette is grouped Catalog / Block /
 * Inputs / Fields / Codegen, with a search box on top. The Fields category is
 * derived from the shared `FIELD_DESCRIPTORS` table (single source of truth).
 * Category `colour` hues avoid needing theme category-style registration.
 */
export const META_TOOLBOX = {
    kind: 'categoryToolbox',
    contents: [
        { kind: 'search' },
        {
            kind: 'category',
            name: 'Catalog',
            colour: `${CATEGORY_COLOUR.catalog}`,
            contents: [
                { kind: 'block', type: 'catalog' },
                { kind: 'block', type: 'implementation' },
                { kind: 'block', type: 'doc_link' },
                { kind: 'block', type: 'dependency_library' },
                { kind: 'block', type: 'dependency_pip' },
                { kind: 'block', type: 'dependency_brick' },
            ],
        },
        {
            kind: 'category',
            name: 'Block',
            colour: `${CATEGORY_COLOUR.block}`,
            contents: [
                { kind: 'block', type: 'block_def' },
                { kind: 'block', type: 'message_row' },
                { kind: 'block', type: 'connection_check' },
                { kind: 'block', type: 'extension' },
            ],
        },
        {
            kind: 'category',
            name: 'Inputs',
            colour: `${CATEGORY_COLOUR.inputs}`,
            contents: [
                { kind: 'block', type: 'input_value' },
                { kind: 'block', type: 'input_statement' },
                { kind: 'block', type: 'input_dummy' },
                { kind: 'block', type: 'input_end_row' },
            ],
        },
        {
            kind: 'category',
            name: 'Fields',
            colour: `${CATEGORY_COLOUR.fields}`,
            // Every modeled field type, derived from the shared descriptor table.
            // (`field_generic` is import-only — it carries unmodeled types verbatim.)
            contents: FIELD_DESCRIPTORS.map(d => ({ kind: 'block', type: d.type })),
        },
        {
            kind: 'category',
            name: 'Codegen',
            colour: `${CATEGORY_COLOUR.codegen}`,
            contents: [
                { kind: 'block', type: 'code_snippet' },
                { kind: 'block', type: 'helper' },
            ],
        },
    ],
};
