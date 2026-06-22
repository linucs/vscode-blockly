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
    message0: 'block catalog   id %1   category %2',
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
    message2: 'description',
    args2: [],
    message3: '%1 %2',
    args3: [
        { type: 'field_multilinetext', name: 'DESCRIPTION', text: '' },
        { type: 'field_translate', name: 'DESC_TR' },
    ],
    message4: 'documentation links',
    args4: [],
    message5: '%1',
    args5: [
        { type: 'input_statement', name: 'DOCS', check: CHECK.DOC },
    ],
    message6: 'implementations (one per runtime)',
    args6: [],
    message7: '%1',
    args7: [
        { type: 'input_statement', name: 'IMPLEMENTATIONS', check: CHECK.IMPLEMENTATION },
    ],
    colour: CATEGORY_COLOUR.catalog,
    tooltip:
        'This is the whole catalog — one file describing a set of blocks people can drag into their program ' +
        '(for example, all the blocks for one sensor or board). Give it a name, category and version here, then ' +
        'add at least one "implementation" below to say which boards it works on and what code each block produces.',
    helpUrl: '',
};
