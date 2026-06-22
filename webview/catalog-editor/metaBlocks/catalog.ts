import { CHECK } from '../connectionChecks';
import { CATEGORY_COLOUR } from './categories';

/**
 * The `catalog` root meta-block — a single, un-nestable hat (no output / no
 * previous / no next connection) holding the catalog-entry metadata fields and
 * the `DOCS` and `IMPLEMENTATIONS` statement slots. Maps to the top level of a
 * `block-catalog_v1` document (id, category, version, author, colour,
 * description, docs). An i18n-object `description` is not modeled in M2 — files
 * carrying one are routed to the raw-text editor by the host gate.
 *
 * English strings are hardcoded; catalog-editor i18n lands in M8.
 */
export const catalogBlock = {
    type: 'catalog',
    message0: 'catalog   id %1   category %2',
    args0: [
        { type: 'field_input', name: 'ID', text: '' },
        { type: 'field_input', name: 'CATEGORY', text: '' },
    ],
    message1: 'version %1   author %2   colour %3',
    args1: [
        { type: 'field_input', name: 'VERSION', text: '' },
        { type: 'field_input', name: 'AUTHOR', text: '' },
        { type: 'field_colour', name: 'COLOUR', colour: '#5b80a5' },
    ],
    message2: 'description %1 %2',
    args2: [
        { type: 'field_multilinetext', name: 'DESCRIPTION', text: '' },
        { type: 'field_translate', name: 'DESC_TR' },
    ],
    message3: 'docs %1',
    args3: [
        { type: 'input_statement', name: 'DOCS', check: CHECK.DOC },
    ],
    message4: 'implementations %1',
    args4: [
        { type: 'input_statement', name: 'IMPLEMENTATIONS', check: CHECK.IMPLEMENTATION },
    ],
    colour: CATEGORY_COLOUR.catalog,
    tooltip: 'Catalog root — one block-catalog file.',
    helpUrl: '',
};
