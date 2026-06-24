/**
 * Canonical runtime ids (`<framework>:<language>`). Single source of truth shared
 * by the webview generator registry (`webview/codegen/core/generatorRegistry.ts`,
 * which keys its builders off these constants) and the extension host (e.g. the
 * "New Block" command's runtime picker). To support a new framework/language
 * combination, add its id here AND register a generator builder in the registry.
 */
export const ARDUINO_CPP_RUNTIME = 'arduino:cpp';
export const ARDUINO_PYTHON_RUNTIME = 'arduino:python';

/** All runtimes with a registered generator, in display order. */
export const SUPPORTED_RUNTIMES = [ARDUINO_CPP_RUNTIME, ARDUINO_PYTHON_RUNTIME] as const;
