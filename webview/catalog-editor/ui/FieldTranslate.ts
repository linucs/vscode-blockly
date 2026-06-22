import * as Blockly from 'blockly';

/**
 * A small clickable “文A” field that opens the {@link openTranslationDialog} for the
 * translatable value its block carries (`message_row` text, `block_def` tooltip,
 * `catalog` description). The glyph is a monochrome text symbol (not a colour emoji)
 * so it inherits the themed Blockly field colour and matches the rest of the UI.
 * It is intentionally dumb: it holds no i18n state and is **not serialized** — the
 * block owns the value (in its `extraState`/`state_`) and provides two hooks,
 * {@link TranslatableBlock}. The field shows a count badge (`文A N`) when the value
 * is a multi-locale map so authors can spot translated fields at a glance; the block
 * calls {@link Blockly.Field.forceRerender} after an edit to refresh it.
 */
export interface TranslatableBlock {
    /** Open the translation dialog for this block; refresh `field` on apply. */
    editTranslations_(field: FieldTranslate): void;
    /** How many locales the value currently has (≥2 → the badge shows). */
    translationLocaleCount_(): number;
}

export class FieldTranslate extends Blockly.Field<string> {
    override SERIALIZABLE = false;
    override EDITABLE = true;

    /** Monochrome translate glyph (文A) — inherits the themed field colour. */
    static readonly GLYPH = '文A';

    constructor() {
        super(FieldTranslate.GLYPH);
    }

    static override fromJson(): FieldTranslate {
        return new FieldTranslate();
    }

    private host(): Partial<TranslatableBlock> | null {
        return this.getSourceBlock() as unknown as Partial<TranslatableBlock> | null;
    }

    protected override getDisplayText_(): string {
        const n = this.host()?.translationLocaleCount_?.() ?? 0;
        return n >= 2 ? `${FieldTranslate.GLYPH} ${n}` : FieldTranslate.GLYPH;
    }

    /** No serialized text — the i18n value lives on the block, not in this field. */
    override getText(): string {
        return '';
    }

    protected override showEditor_(): void {
        this.host()?.editTranslations_?.(this);
    }
}

Blockly.fieldRegistry.register('field_translate', FieldTranslate);
