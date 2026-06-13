// Operator-precedence levels for the Arduino C++ generator, used to decide when
// a valueToCode result needs parenthesising. Shared by the L1 language
// generators (cppLanguageBlocks.ts) and the L2 Arduino-String generators
// (arduinoStringGenerators.ts) — kept in its own module so neither imports the
// other.
export const ORDER = {
    ATOMIC: 0,
    FUNCTION_CALL: 2,
    UNARY: 3,
    MULTIPLICATIVE: 5,
    ADDITIVE: 6,
    RELATIONAL: 9,
    EQUALITY: 10,
    LOGICAL_AND: 14,
    LOGICAL_OR: 15,
    CONDITIONAL: 16,
    NONE: 99,
} as const;
