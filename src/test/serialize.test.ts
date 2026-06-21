import * as assert from 'assert';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { dumpCatalog, serializeWorkspace } from '../catalog/serialize';
import type { MetaWorkspace } from '../catalog/serialize/types';
import { BlockSpec, chain } from '../catalog/serialize/blockSpec';
import { validateCatalogResult } from '../catalog/validateCatalog';

const FULL: CatalogEntry = {
    id: 'arduino-demo',
    category: 'I/O::Digital',
    version: '1.0.0',
    author: 'Jane',
    colour: '#ff8800',
    description: 'A demo catalog.',
    docs: {
        datasheet: 'https://example.com/datasheet',
        api: 'https://example.com/api',
    },
    implementations: [
        {
            runtime: 'arduino:cpp',
            targets: ['uno', 'nano'],
            dependencies: [
                { type: 'library', name: 'Servo', minVersion: '1.2.0', url: 'https://example.com/servo.git', ref: 'v1.2.0' },
                { type: 'pip', name: 'pyserial', minVersion: '3.5' },
                { type: 'brick', name: 'thermo', variables: { pin: 'A0', mode: 'analog' } },
            ],
            blocks: [],
        },
    ],
};

suite('catalog serializer', () => {
    test('round-trips a full metadata entry through dump → load', () => {
        const reparsed = yaml.load(dumpCatalog(FULL));
        assert.deepStrictEqual(reparsed, FULL);
    });

    test('emits keys in canonical order', () => {
        const text = dumpCatalog(FULL);
        const order = ['id:', 'author:', 'version:', 'category:', 'colour:', 'description:', 'docs:', 'implementations:'];
        const positions = order.map(k => text.indexOf(k));
        for (let i = 1; i < positions.length; i++) {
            assert.ok(positions[i] > positions[i - 1], `"${order[i]}" should follow "${order[i - 1]}"`);
        }
        // Implementation-level order: runtime before targets before dependencies before blocks.
        assert.ok(text.indexOf('runtime:') < text.indexOf('targets:'));
        assert.ok(text.indexOf('targets:') < text.indexOf('dependencies:'));
        assert.ok(text.indexOf('dependencies:') < text.indexOf('blocks:'));
    });

    test('omits empty optional fields', () => {
        const minimal: CatalogEntry = {
            id: 'x',
            category: 'C',
            implementations: [{ runtime: 'arduino:cpp', blocks: [] }],
        };
        const text = dumpCatalog(minimal);
        assert.ok(!text.includes('author:'), 'no empty author');
        assert.ok(!text.includes('version:'), 'no empty version');
        assert.ok(!text.includes('targets:'), 'no empty targets');
        assert.ok(!text.includes('dependencies:'), 'no empty dependencies');
    });

    test('preserves each dependency discriminant', () => {
        const reparsed = yaml.load(dumpCatalog(FULL)) as CatalogEntry;
        const deps = reparsed.implementations[0].dependencies!;
        assert.deepStrictEqual(deps[0], { type: 'library', name: 'Servo', minVersion: '1.2.0', url: 'https://example.com/servo.git', ref: 'v1.2.0' });
        assert.deepStrictEqual(deps[1], { type: 'pip', name: 'pyserial', minVersion: '3.5' });
        assert.deepStrictEqual(deps[2], { type: 'brick', name: 'thermo', variables: { pin: 'A0', mode: 'analog' } });
    });

    test('a metadata-only catalog is schema-incomplete only on missing blocks', () => {
        const result = validateCatalogResult(dumpCatalog(FULL));
        const schemaIssues = result.issues.filter(i => i.kind === 'schema');
        assert.strictEqual(schemaIssues.length, 1, 'exactly one schema issue');
        assert.match(schemaIssues[0].message, /blocks/, 'and it is about the empty blocks');
    });

    test('serializes a meta-workspace (BlockSpec tree) to the same YAML', () => {
        const dep = new BlockSpec('dependency_library', { NAME: 'Servo', MINVERSION: '1.2.0', URL: '', REF: '' });
        const impl = new BlockSpec(
            'implementation',
            { RUNTIME: 'arduino:cpp', TARGET0: 'uno', TARGET1: 'nano' },
            { DEPENDENCIES: chain([dep]) },
        );
        const doc = new BlockSpec('doc_link', { NAME: 'api', URL: 'https://example.com/api' });
        const hat = new BlockSpec(
            'catalog',
            { ID: 'demo', CATEGORY: 'I/O', VERSION: '', AUTHOR: '', COLOUR: '', DESCRIPTION: '' },
            { DOCS: chain([doc]), IMPLEMENTATIONS: chain([impl]) },
        );
        const ws: MetaWorkspace = { getTopBlocks: () => [hat] };

        const reparsed = yaml.load(serializeWorkspace(ws)) as CatalogEntry;
        assert.deepStrictEqual(reparsed, {
            id: 'demo',
            category: 'I/O',
            docs: { api: 'https://example.com/api' },
            implementations: [
                {
                    runtime: 'arduino:cpp',
                    targets: ['uno', 'nano'],
                    dependencies: [{ type: 'library', name: 'Servo', minVersion: '1.2.0' }],
                    // `blocks` is omitted for a metadata-only implementation (real
                    // files omit it; the host validator flags it on save).
                },
            ],
        });
    });

    test('serializeWorkspace returns empty string when there is no catalog hat', () => {
        const ws: MetaWorkspace = { getTopBlocks: () => [] };
        assert.strictEqual(serializeWorkspace(ws), '');
    });
});
