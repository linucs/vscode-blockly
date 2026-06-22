import * as Blockly from 'blockly';
import { buildBlockDefinition } from '../../src/catalog/serialize/blockDef';
import type { MetaBlock } from '../../src/catalog/serialize/types';
import { preprocessCatalogI18n } from '../codegen/core/catalogI18nPreprocess';
import { injectThemedWorkspace } from '../blocklyBootstrap';

/**
 * Read-only live preview (design §5c): a second Blockly instance that renders the
 * *real* block being authored, so the user sees what they are building. The
 * selected `block_def` is serialized (the same `buildBlockDefinition` the save
 * path uses), its i18n messages resolved to the current locale, and defined under
 * a fixed sentinel type so the global block registry isn't polluted per keystroke.
 * Any failure (e.g. an external `field_variable` reference) degrades to a notice.
 */
const PREVIEW_TYPE = '__catalog_preview__';
let previewWs: Blockly.WorkspaceSvg | undefined;

export function initPreview(container: Element): void {
    ({ workspace: previewWs } = injectThemedWorkspace(container, {
        readOnly: true,
        trashcan: false,
        zoom: { controls: false, wheel: false, startScale: 1 },
    }));
}

/** Re-layout the preview workspace after its container resizes (pane drag/window). */
export function resizePreview(): void {
    if (previewWs) {
        Blockly.svgResize(previewWs);
    }
}

export function updatePreview(block: MetaBlock | null, locale: string, setNotice: (text: string) => void): void {
    if (!previewWs) {
        return;
    }
    previewWs.clear();
    if (!block) {
        setNotice('');
        return;
    }
    try {
        const def = buildBlockDefinition(block);
        // Deep-clone so the preprocessor's in-place i18n resolution can't touch the
        // live model, then resolve message/tooltip locale maps to plain strings.
        const blockly = JSON.parse(JSON.stringify(def.blockly)) as Record<string, unknown>;

        // A block being authored is often transiently incomplete — a message that
        // doesn't yet reference all its args. Blockly would throw on that; detect it
        // first and show a calm notice instead of spamming the console.
        if (!messageArgsConsistent(blockly)) {
            setNotice('Preview unavailable — message must reference every arg with %1, %2…');
            return;
        }

        // The first-party field/extension surface is registered (see blockFields.ts),
        // so our own blocks preview faithfully. A community catalog could still name
        // an extension we don't ship — defining with an unknown one throws, so strip
        // only the genuinely-unregistered ones (the block's shape still renders).
        if (Array.isArray(blockly.extensions)) {
            const known = (blockly.extensions as string[]).filter(name => Blockly.Extensions.isRegistered(name));
            if (known.length > 0) {
                blockly.extensions = known;
            } else {
                delete blockly.extensions;
            }
        }

        preprocessCatalogI18n([{ implementations: [{ blocks: [{ blockly }] }] }], locale);
        blockly.type = PREVIEW_TYPE;
        // Re-defining the same type each refresh warns "overwrites previous
        // definition" — clear it first so the preview stays quiet.
        delete (Blockly.Blocks as Record<string, unknown>)[PREVIEW_TYPE];
        Blockly.common.defineBlocksWithJsonArray([blockly]);
        const preview = previewWs.newBlock(PREVIEW_TYPE) as Blockly.BlockSvg;
        preview.initSvg();
        preview.render();
        preview.moveBy(12, 12);
        setNotice('');
    } catch (err) {
        console.warn('catalog preview failed', err);
        setNotice('Preview unavailable for this block.');
    }
}

/** Every `args{n}` entry must be referenced by a `%N` in its `message{n}` (Blockly's rule). */
function messageArgsConsistent(blockly: Record<string, unknown>): boolean {
    for (let n = 0; `message${n}` in blockly; n++) {
        const msg = blockly[`message${n}`];
        const text = typeof msg === 'string'
            ? msg
            : (msg && typeof msg === 'object' ? String(Object.values(msg as Record<string, string>)[0] ?? '') : '');
        const nums = [...text.matchAll(/%(\d+)/g)].map(m => Number(m[1]));
        const maxToken = nums.length > 0 ? Math.max(...nums) : 0;
        const argCount = Array.isArray(blockly[`args${n}`]) ? (blockly[`args${n}`] as unknown[]).length : 0;
        if (argCount !== maxToken) {
            return false;
        }
    }
    return true;
}
