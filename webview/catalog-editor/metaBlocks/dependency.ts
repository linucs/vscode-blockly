import { CHECK } from '../connectionChecks';

/**
 * The three `dependency_*` meta-blocks (library / pip / brick), discriminated by
 * block type. All three carry previous/next connections typed `CHECK.DEPENDENCY`,
 * so they only stack inside `implementation.DEPENDENCIES`. Each maps to one
 * branch of the schema's `Dependency` oneOf; the serializer reads the block type
 * to emit the `type:` discriminant.
 *
 * `brick.variables` (a string→string map) is a `k=v, k=v` text field parsed by
 * the serializer — a nested-map UI is deferred.
 */
export const dependencyBlocks = [
    {
        type: 'dependency_library',
        message0: 'library   name %1   minVersion %2',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
            { type: 'field_input', name: 'MINVERSION', text: '' },
        ],
        message1: 'url %1   ref %2',
        args1: [
            { type: 'field_input', name: 'URL', text: '' },
            { type: 'field_input', name: 'REF', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'PlatformIO/registry or VCS library dependency.',
        helpUrl: '',
    },
    {
        type: 'dependency_pip',
        message0: 'pip   name %1   minVersion %2',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
            { type: 'field_input', name: 'MINVERSION', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'Python pip dependency.',
        helpUrl: '',
    },
    {
        type: 'dependency_brick',
        message0: 'brick   name %1',
        args0: [
            { type: 'field_input', name: 'NAME', text: '' },
        ],
        message1: 'variables %1',
        args1: [
            { type: 'field_input', name: 'VARIABLES', text: '' },
        ],
        previousStatement: CHECK.DEPENDENCY,
        nextStatement: CHECK.DEPENDENCY,
        colour: 60,
        tooltip: 'App Lab brick dependency (variables as k=v, k=v).',
        helpUrl: '',
    },
];
