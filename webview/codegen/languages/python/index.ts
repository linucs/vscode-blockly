import { LanguageProfile } from '../../core/languageProfile';
import { registerPythonLanguageBlocks, PYTHON_KEYWORDS } from './languageBlocks';

/**
 * Catalog-facing precedence vocabulary (the `CodegenPrecedence` names) mapped to
 * Python numeric levels. Used by `CodeFactory` to decide parenthesisation of
 * declarative value blocks. Levels mirror `blockly/python`'s `Order` enum
 * (ATOMIC=0, UNARY_SIGN/BITWISE_NOT=4, MULTIPLICATIVE=5, ADDITIVE=6,
 * RELATIONAL=11, LOGICAL_AND=13, LOGICAL_OR=14, NONE=99). Python has no distinct
 * equality precedence — `==`/`!=` are RELATIONAL — so EQUALITY maps to 11.
 */
const PYTHON_PRECEDENCE: Readonly<Record<string, number>> = {
    ATOMIC: 0,
    UNARY_PREFIX: 4,
    MULTIPLICATION: 5,
    ADDITION: 6,
    RELATIONAL: 11,
    EQUALITY: 11,
    LOGICAL_AND: 13,
    LOGICAL_OR: 14,
    NONE: 99,
};

/** The Python language profile (axis 1): reusable by any `<framework>:python` runtime. */
export const pythonLanguageProfile: LanguageProfile = {
    id: 'python',
    reservedWords: PYTHON_KEYWORDS,
    precedence: PYTHON_PRECEDENCE,
    registerLanguageBlocks(generator) {
        registerPythonLanguageBlocks(generator);
    },
};
