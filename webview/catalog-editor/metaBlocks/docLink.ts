import { CHECK } from '../connectionChecks';

/**
 * Conventional documentation kinds offered in the `doc_link` name dropdown.
 * `field_combobox` also accepts a custom value, so a catalog using a non-standard
 * key (e.g. `wiki`) still round-trips — the value is preserved as free text.
 */
const DOC_KINDS: [string, string][] = [
    ['datasheet', 'datasheet'],
    ['library', 'library'],
    ['api', 'api'],
    ['reference', 'reference'],
    ['tutorial', 'tutorial'],
    ['guide', 'guide'],
    ['example', 'example'],
    ['repository', 'repository'],
];

/**
 * The `doc_link` meta-block — one named documentation URL. Its previous/next
 * connections are typed `CHECK.DOC`, so it only stacks inside `catalog.DOCS`.
 * The stack maps to the catalog-entry `docs` map (name → URL). The name is a
 * combobox of common doc kinds (custom values still allowed).
 */
export const docLinkBlock = {
    type: 'doc_link',
    message0: 'doc %1   url %2',
    args0: [
        { type: 'field_combobox', name: 'NAME', options: DOC_KINDS },
        { type: 'field_input', name: 'URL', text: '' },
    ],
    previousStatement: CHECK.DOC,
    nextStatement: CHECK.DOC,
    colour: 190,
    tooltip: 'A documentation link (name → URL).',
    helpUrl: '',
};
