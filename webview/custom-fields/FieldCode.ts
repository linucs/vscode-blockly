import * as Blockly from 'blockly';
import type { EditorView } from '@codemirror/view';
import { createCodeEditor, langForRuntime, runtimeForBlock } from './codeMirror';

const MAX_DISPLAY_LENGTH = 30;

let activeFieldCode: FieldCode | null = null;

/**
 * A code-editing field that shows a truncated preview on the block and opens a
 * modal with a CodeMirror editor when clicked. Syntax highlighting follows the
 * enclosing `implementation`'s runtime language (catalog editor); `{{NAME}}`
 * placeholders are highlighted. Falls back to a plain editor (no grammar) where
 * the runtime can't be resolved.
 *
 * Registered as `field_code` in the Blockly field registry.
 */
export class FieldCode extends Blockly.Field<string | undefined> {
    override SERIALIZABLE = true;
    override EDITABLE = true;

    private modalEl_: HTMLDivElement | null = null;
    private editor_: EditorView | null = null;

    constructor(value?: string, validator?: Blockly.FieldValidator<string | undefined>) {
        super(value || '', validator);
    }

    static override fromJson(options: Record<string, unknown>): FieldCode {
        return new FieldCode(options['text'] as string | undefined);
    }

    protected override doClassValidation_(value?: string): string | null {
        if (value === undefined || value === null) return '';
        return String(value);
    }

    protected override getDisplayText_(): string {
        const val = this.getValue();
        if (!val) return '✎ click to edit';
        const lines = val.split('\n');
        const first =
            lines[0].length > MAX_DISPLAY_LENGTH
                ? lines[0].slice(0, MAX_DISPLAY_LENGTH) + '…'
                : lines[0];
        if (lines.length > 1) return `${first}  (+${lines.length - 1} lines)`;
        return first;
    }

    protected override showEditor_(): void {
        if (activeFieldCode) return;
        activeFieldCode = this;
        this.createModal_();
    }

    private createModal_(): void {
        const styles = getComputedStyle(document.body);
        const bg = styles.getPropertyValue('--vscode-editor-background').trim() || '#1e1e1e';
        const fg = styles.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4';
        const widgetBg = styles.getPropertyValue('--vscode-editorWidget-background').trim() || '#252526';
        const widgetBorder = styles.getPropertyValue('--vscode-editorWidget-border').trim() || '#454545';
        const selectionBg = styles.getPropertyValue('--vscode-editor-selectionBackground').trim() || '#264f78';
        const font = styles.getPropertyValue('--vscode-editor-fontFamily').trim() || '"Courier New", monospace';

        // Backdrop
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '100000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
        });

        const backdrop = document.createElement('div');
        Object.assign(backdrop.style, { position: 'absolute', inset: '0' });
        backdrop.addEventListener('click', () => this.closeModal_());

        // Dialog
        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            position: 'relative',
            backgroundColor: widgetBg,
            border: `1px solid ${widgetBorder}`,
            borderRadius: '6px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            width: '500px',
            maxWidth: '90vw',
            maxHeight: '70vh',
            color: fg,
            fontFamily: font,
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: `1px solid ${widgetBorder}`,
        });

        const title = document.createElement('span');
        title.textContent = Blockly.Msg['FIELD_CODE_TITLE'] ?? 'Code snippet';
        Object.assign(title.style, {
            fontSize: '13px',
            fontWeight: '600',
        });

        const doneBtn = document.createElement('button');
        doneBtn.textContent = Blockly.Msg['FIELD_CODE_DONE'] ?? 'Done';
        Object.assign(doneBtn.style, {
            padding: '4px 14px',
            fontSize: '12px',
            borderRadius: '3px',
            border: 'none',
            backgroundColor: selectionBg,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
        });
        doneBtn.addEventListener('click', () => this.closeModal_());

        header.appendChild(title);
        header.appendChild(doneBtn);

        // Editor host — CodeMirror mounts here. Background/scroll live on the host so
        // the editor fills the dialog body; the editor theme is transparent over it.
        const host = document.createElement('div');
        Object.assign(host.style, {
            flex: '1',
            minHeight: '240px',
            overflow: 'auto',
            backgroundColor: bg,
            borderBottomLeftRadius: '6px',
            borderBottomRightRadius: '6px',
        });
        // Keep keystrokes inside the editor (don't let Blockly shortcuts fire).
        host.addEventListener('keydown', e => e.stopPropagation());

        dialog.appendChild(header);
        dialog.appendChild(host);
        modal.appendChild(backdrop);
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        this.modalEl_ = modal;

        const lang = langForRuntime(runtimeForBlock(this.getSourceBlock()));
        this.editor_ = createCodeEditor({
            parent: host,
            doc: this.getValue() || '',
            lang,
            onEscape: () => this.closeModal_(),
        });
        this.editor_.focus();
    }

    private closeModal_(): void {
        if (this.editor_) {
            this.setValue(this.editor_.state.doc.toString());
            this.editor_.destroy();
            this.editor_ = null;
        }
        if (this.modalEl_) {
            this.modalEl_.remove();
            this.modalEl_ = null;
        }
        activeFieldCode = null;
    }

    override dispose(): void {
        if (activeFieldCode === this) {
            this.closeModal_();
        }
        super.dispose();
    }
}

Blockly.fieldRegistry.register('field_code', FieldCode);
