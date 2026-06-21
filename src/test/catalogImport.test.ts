import * as assert from 'assert';
import * as yaml from 'js-yaml';
import { importCatalog } from '../catalog/serialize/import';
import { serializeWorkspace } from '../catalog/serialize';
import type { MetaWorkspace } from '../catalog/serialize/types';
import type { BlockSpec } from '../catalog/serialize/blockSpec';

const META = `
id: arduino-demo
category: "I/O::Digital"
version: "1.0.0"
author: Jane
docs:
  datasheet: "https://example.com/datasheet"
  api: "https://example.com/api"
implementations:
  - runtime: "arduino:cpp"
    targets:
      - uno
      - nano
    dependencies:
      - type: library
        name: Servo
        minVersion: "1.2.0"
      - type: pip
        name: pyserial
      - type: brick
        name: thermo
        variables:
          pin: "A0"
`;

/** Serialize a single imported hat the way the runtime workspace would. */
function serializeSpec(spec: BlockSpec | null): string {
    const ws: MetaWorkspace = { getTopBlocks: () => (spec ? [spec] : []) };
    return serializeWorkspace(ws);
}

suite('catalog importer', () => {
    test('imports metadata, implementation, and dependency fields', () => {
        const hat = importCatalog(META)!;
        assert.strictEqual(hat.type, 'catalog');
        assert.strictEqual(hat.getFieldValue('ID'), 'arduino-demo');
        assert.strictEqual(hat.getFieldValue('CATEGORY'), 'I/O::Digital');
        assert.strictEqual(hat.getFieldValue('AUTHOR'), 'Jane');

        const doc0 = hat.getInputTargetBlock('DOCS') as BlockSpec;
        assert.strictEqual(doc0.type, 'doc_link');
        assert.strictEqual(doc0.getFieldValue('NAME'), 'datasheet');
        assert.strictEqual(doc0.getFieldValue('URL'), 'https://example.com/datasheet');
        assert.strictEqual((doc0.getNextBlock() as BlockSpec).getFieldValue('NAME'), 'api');

        const impl = hat.getInputTargetBlock('IMPLEMENTATIONS') as BlockSpec;
        assert.strictEqual(impl.type, 'implementation');
        assert.strictEqual(impl.getFieldValue('RUNTIME'), 'arduino:cpp');

        // Targets are variadic TARGET{i} fields with a targetCount mutator state.
        assert.strictEqual(impl.getFieldValue('TARGET0'), 'uno');
        assert.strictEqual(impl.getFieldValue('TARGET1'), 'nano');
        assert.strictEqual(impl.getFieldValue('TARGET2'), null);
        assert.deepStrictEqual(impl.extraState, { targetCount: 2 });

        const dep0 = impl.getInputTargetBlock('DEPENDENCIES') as BlockSpec;
        assert.strictEqual(dep0.type, 'dependency_library');
        assert.strictEqual(dep0.getFieldValue('NAME'), 'Servo');
        const dep1 = dep0.getNextBlock() as BlockSpec;
        assert.strictEqual(dep1.type, 'dependency_pip');
        const dep2 = dep1.getNextBlock() as BlockSpec;
        assert.strictEqual(dep2.type, 'dependency_brick');
        assert.strictEqual(dep2.getFieldValue('VARIABLES'), 'pin=A0');
    });

    test('serialize(import(yaml)) reproduces the catalog (modulo empty blocks)', () => {
        const out = serializeSpec(importCatalog(META));
        const expected = {
            id: 'arduino-demo',
            category: 'I/O::Digital',
            version: '1.0.0',
            author: 'Jane',
            docs: {
                datasheet: 'https://example.com/datasheet',
                api: 'https://example.com/api',
            },
            implementations: [
                {
                    runtime: 'arduino:cpp',
                    targets: ['uno', 'nano'],
                    dependencies: [
                        { type: 'library', name: 'Servo', minVersion: '1.2.0' },
                        { type: 'pip', name: 'pyserial' },
                        { type: 'brick', name: 'thermo', variables: { pin: 'A0' } },
                    ],
                    // `blocks` is omitted: a metadata-only implementation is
                    // schema-incomplete by design and real files omit it.
                },
            ],
        };
        assert.deepStrictEqual(yaml.load(out), expected);
    });

    test('round-trip is idempotent (fixpoint)', () => {
        const s1 = serializeSpec(importCatalog(META));
        const s2 = serializeSpec(importCatalog(s1));
        assert.strictEqual(s1, s2);
    });

    test('returns null for an empty document', () => {
        assert.strictEqual(importCatalog(''), null);
        assert.strictEqual(importCatalog('\n\n'), null);
    });
});
