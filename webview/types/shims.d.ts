// Ambient declarations for the webview (browser) bundle.

// These Blockly plugins ship no type declarations (no `types` field, no dist
// `.d.ts`). Declare them so the webview type-checks; prefer real upstream types
// if either package later ships them.

// Minimal typed surface — we subclass TypedVariableModal (StyledTypedVariableModal
// in plugins.ts), so the base needs a real constructor signature; a shorthand
// `any` module would synthesise a zero-arg constructor and reject the 4-arg `new`.
declare module '@blockly/plugin-typed-variable-modal' {
    export class TypedVariableModal {
        constructor(
            workspace: unknown,
            callbackName: string,
            types: [string, string][],
            optMessages?: Record<string, string>,
        );
        init(): void;
        dispose(): void;
        show(): void;
    }
}

// Used only as a value (never subclassed) — shorthand `any` is sufficient.
declare module '@mit-app-inventor/blockly-plugin-workspace-multiselect';

// VS Code webview API global, injected by the webview host at runtime.
declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};
