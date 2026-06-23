import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../CatalogTypes';
import { buildCatalogEntry } from './catalog';
import { buildBlockDefinition } from './blockDef';
import type { MetaBlock, MetaWorkspace } from './types';

/**
 * The single YAML producer (design §3a rule 3, §5d): walk the meta-workspace,
 * build a typed {@link CatalogEntry}, order its keys canonically, and `yaml.dump`
 * with the project's canonical options. No string concatenation; the host never
 * serializes — it receives this text, validates, and writes.
 */

// Canonical key order matching hand-authored catalogs (verified against
// catalogs/**/*.yaml). js-yaml preserves object insertion order, so building the
// objects in this order — via orderKeys — is what fixes the on-disk layout.
const ENTRY_ORDER = ['id', 'author', 'version', 'category', 'colour', 'description', 'docs', 'implementations'];
const IMPL_ORDER = ['runtime', 'targets', 'dependencies', 'codegen', 'blocks'];
const DEP_ORDER = ['type', 'name', 'minVersion', 'url', 'ref', 'variables'];

/** Rebuild `obj` with `order`'s keys first (when present), then any remaining keys. */
function orderKeys<T extends object>(obj: T, order: string[]): T {
    const src = obj as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of order) {
        if (key in src && src[key] !== undefined) {
            out[key] = src[key];
        }
    }
    for (const key of Object.keys(src)) {
        if (!(key in out)) {
            out[key] = src[key];
        }
    }
    return out as T;
}

/** Apply canonical key ordering to the entry and every nested impl/dependency. */
function orderCatalogForDump(entry: CatalogEntry): CatalogEntry {
    const ordered = orderKeys(entry, ENTRY_ORDER);
    ordered.implementations = ordered.implementations.map(impl => {
        const oi = orderKeys(impl, IMPL_ORDER);
        if (oi.dependencies) {
            oi.dependencies = oi.dependencies.map(dep => orderKeys(dep, DEP_ORDER));
        }
        return oi;
    });
    return ordered;
}

/** js-yaml options that produce the project's canonical on-disk style (§5d). */
export const DUMP_OPTIONS: yaml.DumpOptions = {
    flowLevel: -1,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
};

/**
 * Schema modeline emitted as the first line of every serialized catalog. The YAML
 * Language Server reads it to provide validation/autocomplete in the raw-text editor.
 * Hand-authored catalogs carry this line; js-yaml drops comments on round-trip, so
 * `dumpCatalog` re-emits it unconditionally to avoid stripping it on save.
 */
export const SCHEMA_MODELINE =
    '# yaml-language-server: $schema=https://raw.githubusercontent.com/linucs/vscode-blockly/refs/heads/main/src/catalog/block-catalog_v1.schema.json';

/** Serialize a {@link CatalogEntry} to canonical catalog YAML (with schema modeline). */
export function dumpCatalog(entry: CatalogEntry): string {
    return `${SCHEMA_MODELINE}\n${yaml.dump(orderCatalogForDump(entry), DUMP_OPTIONS)}`;
}

/**
 * Serialize a single authored `block_def` to the canonical YAML of one
 * `implementations[].blocks[]` entry — the same {@link buildBlockDefinition} the
 * save path uses, so the editor's per-block YAML preview matches what gets written.
 */
export function dumpBlockDefinition(block: MetaBlock): string {
    return yaml.dump(buildBlockDefinition(block), DUMP_OPTIONS);
}

/**
 * Serialize the meta-workspace to catalog YAML. Returns `''` when there is no
 * `catalog` hat yet (empty workspace). If more than one hat exists, the first is
 * used (the host validator flags the rest as duplicates).
 */
export function serializeWorkspace(workspace: MetaWorkspace): string {
    const hat = workspace.getTopBlocks(true).find(b => b.type === 'catalog');
    if (!hat) {
        return '';
    }
    return dumpCatalog(buildCatalogEntry(hat));
}
