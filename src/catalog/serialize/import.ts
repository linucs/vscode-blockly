import * as yaml from 'js-yaml';
import type { CatalogEntry, Implementation, Dependency } from '../CatalogTypes';
import { BlockSpec, chain } from './blockSpec';

/**
 * Import (the inverse of {@link ./index.serializeWorkspace}): parse a metadata-
 * only catalog YAML into a `catalog` {@link BlockSpec} tree the webview renders
 * into real Blockly blocks. Restricted to what M2 models — metadata,
 * implementations, dependencies — which is exactly what the host gate
 * (`canEditInGuidedUi`) lets through, so there is no un-modeled content to carry.
 *
 * Field values mirror what the serializer reads back: `targets` and brick
 * `variables` are joined with the same delimiters the serializer splits on, so
 * `serialize(import(yaml))` is an identity round-trip.
 *
 * Returns `null` for an empty document (nothing to edit).
 */
export function importCatalog(yamlText: string): BlockSpec | null {
    const doc = yaml.load(yamlText);
    if (doc === null || doc === undefined || typeof doc !== 'object') {
        return null;
    }
    return specFromEntry(doc as CatalogEntry);
}

export function specFromEntry(entry: CatalogEntry): BlockSpec {
    const fields: Record<string, string> = {
        ID: entry.id ?? '',
        CATEGORY: entry.category ?? '',
        VERSION: entry.version ?? '',
        AUTHOR: entry.author ?? '',
        COLOUR: entry.colour ?? '',
        DESCRIPTION: typeof entry.description === 'string' ? entry.description : '',
    };
    const docs = Object.entries(entry.docs ?? {}).map(([name, url]) =>
        new BlockSpec('doc_link', { NAME: name, URL: url }),
    );
    const impls = (entry.implementations ?? []).map(specFromImplementation);
    return new BlockSpec('catalog', fields, {
        DOCS: chain(docs),
        IMPLEMENTATIONS: chain(impls),
    });
}

function specFromImplementation(impl: Implementation): BlockSpec {
    const targets = impl.targets ?? [];
    const fields: Record<string, string> = { RUNTIME: impl.runtime ?? '' };
    targets.forEach((t, i) => { fields[`TARGET${i}`] = t; });

    const deps = (impl.dependencies ?? []).map(specFromDependency);
    const spec = new BlockSpec('implementation', fields, { DEPENDENCIES: chain(deps) });
    // Tell the renderer how many TARGET{i} rows to create before fields are set.
    spec.extraState = { targetCount: targets.length };
    return spec;
}

function specFromDependency(dep: Dependency): BlockSpec {
    switch (dep.type) {
        case 'library':
            return new BlockSpec('dependency_library', {
                NAME: dep.name ?? '',
                MINVERSION: dep.minVersion ?? '',
                URL: dep.url ?? '',
                REF: dep.ref ?? '',
            });
        case 'pip':
            return new BlockSpec('dependency_pip', {
                NAME: dep.name ?? '',
                MINVERSION: dep.minVersion ?? '',
            });
        case 'brick':
            return new BlockSpec('dependency_brick', {
                NAME: dep.name ?? '',
                VARIABLES: Object.entries(dep.variables ?? {}).map(([k, v]) => `${k}=${v}`).join(', '),
            });
    }
}
