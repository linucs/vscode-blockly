import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { serializeWorkspace } from '../catalog/serialize';
import type { MetaBlock, MetaWorkspace } from '../catalog/serialize/types';
import { importCatalog } from '../catalog/serialize/import';
import { semanticallyEqualYaml } from '../catalog/serialize/normalize';

/**
 * Full-corpus drift detector (design "Drift-prevention" #3). Every catalog YAML —
 * the bundled `catalogs/**` and, when the sibling clone is present, the published
 * community catalog — must **semantically** round-trip (import → serialize → parse
 * deep-equals the original). The round-trip is semantic, not byte: `js-yaml.dump`
 * cannot reproduce hand-authored styling, but the data must be preserved exactly.
 *
 * The only legitimate non-guided files are the gate's fallbacks: `generator:`
 * (imperative tier), `mutator`, and multi-document YAML. They are detected and
 * excluded here, mirroring `canEditInGuidedUi`.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES = [
    path.join(REPO_ROOT, 'catalogs'),
    path.join(REPO_ROOT, '..', 'blocks-community-catalog', 'catalogs'),
];

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full));
        } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
            out.push(full);
        }
    }
    return out;
}

/** Mirror the gate: files that must fall back to the raw-text editor, not round-trip here. */
function isFallback(text: string): boolean {
    if (/^\s*generator:/m.test(text) || /\bmutator\b/.test(text)) {
        return true;
    }
    try {
        return yaml.loadAll(text).filter(d => d && typeof d === 'object').length > 1;
    } catch {
        return true; // parse error → not guided-editable
    }
}

function roundTripsSemantically(yamlText: string): boolean {
    const spec = importCatalog(yamlText);
    const workspace: MetaWorkspace = { getTopBlocks: () => (spec ? [spec as unknown as MetaBlock] : []) };
    return semanticallyEqualYaml(yamlText, serializeWorkspace(workspace));
}

suite('corpus round-trip (semantic, all catalogs)', () => {
    for (const source of SOURCES) {
        const label = path.relative(REPO_ROOT, source);
        if (!fs.existsSync(source)) {
            test(`skips absent source: ${label}`, function () {
                this.skip();
            });
            continue;
        }
        for (const file of walk(source)) {
            const rel = path.relative(REPO_ROOT, file);
            const text = fs.readFileSync(file, 'utf8');
            if (isFallback(text)) {
                continue; // gate fallback — not modeled by design
            }
            test(`round-trips ${rel}`, () => {
                assert.ok(roundTripsSemantically(text), `${rel} did not round-trip semantically`);
            });
        }
    }
});
