/**
 * Toolbox category colours — the single source of truth shared between the toolbox
 * definition ({@link META_TOOLBOX}) and the meta-block definitions.
 *
 * Blocks in the **Inputs**, **Fields** and **Codegen** categories carry the same
 * functional weight within their group, so they take their category's colour rather
 * than each choosing its own. The **Catalog** and **Block** categories instead group
 * blocks whose individually meaningful colours are kept.
 */
export const CATEGORY_COLOUR = {
    catalog: 210,
    block: 230,
    inputs: 160,
    fields: 290,
    codegen: 20,
} as const;
