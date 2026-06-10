import * as assert from 'assert';
import { collectUsedBlockTypes } from '../project/blockUsage';
import { collectRequirements, composePioLibDep } from '../catalog/requirements';
import { mergeEnvLists } from '../project/pio/iniMerge';
import { mergeSketchLibraries } from '../project/arduino/sketchYamlMerge';
import { CatalogEntry } from '../catalog/CatalogTypes';

suite('collectUsedBlockTypes', () => {
    test('walks inputs, shadows and next chains', () => {
        const state = {
            blocks: {
                blocks: [
                    {
                        type: 'controls_if',
                        inputs: { IF0: { block: { type: 'logic_compare', inputs: {
                            A: { shadow: { type: 'math_number' } },
                            B: { block: { type: 'modulino_thermo_temperature' } },
                        } } }, DO0: { block: { type: 'demo_do', next: { block: { type: 'demo_do2' } } } } },
                    },
                ],
            },
        };
        const types = collectUsedBlockTypes(state).sort();
        assert.deepStrictEqual(types, [
            'controls_if', 'demo_do', 'demo_do2', 'logic_compare', 'math_number', 'modulino_thermo_temperature',
        ]);
    });

    test('empty / malformed states yield nothing', () => {
        assert.deepStrictEqual(collectUsedBlockTypes(undefined), []);
        assert.deepStrictEqual(collectUsedBlockTypes({}), []);
        assert.deepStrictEqual(collectUsedBlockTypes({ blocks: {} }), []);
    });
});

suite('collectRequirements', () => {
    const entries: CatalogEntry[] = [
        {
            id: 'thermo', category: 'Sensors',
            implementations: [{
                runtime: 'arduino:cpp',
                dependencies: [{ type: 'library', name: 'Arduino_Modulino', minVersion: '0.8.0' }],
                blocks: [{ blockly: { type: 'thermo_read' } }],
            }],
        },
        {
            id: 'cloud', category: 'IoT',
            implementations: [{
                runtime: 'espidf:cpp' as any,
                dependencies: [{ type: 'library', name: 'something' }],
                blocks: [{ blockly: { type: 'cloud_pub' } }],
            }],
        },
    ];

    test('composePioLibDep adds the ^minVersion when present', () => {
        assert.strictEqual(composePioLibDep({ type: 'library', name: 'Foo', minVersion: '1.2.3' }), 'Foo@^1.2.3');
        assert.strictEqual(composePioLibDep({ type: 'library', name: 'Foo' }), 'Foo');
    });

    test('composePioLibDep emits name=url#ref for VCS libraries (not in PIO registry)', () => {
        assert.strictEqual(
            composePioLibDep({
                type: 'library',
                name: 'Arduino_Nesso_N1',
                url: 'https://github.com/arduino-libraries/Arduino_Nesso_N1.git',
                ref: 'v1.0.0',
            }),
            'Arduino_Nesso_N1=https://github.com/arduino-libraries/Arduino_Nesso_N1.git#v1.0.0',
        );
        assert.strictEqual(
            composePioLibDep({
                type: 'library',
                name: 'Lib',
                url: 'https://example.com/Lib.git',
                minVersion: '9.9.9',
            }),
            'Lib=https://example.com/Lib.git',
        );
    });

    test('collects lib_deps for used cpp blocks', () => {
        const r = collectRequirements(entries, ['thermo_read'], 'arduino:cpp');
        assert.deepStrictEqual(r.libDeps, ['Arduino_Modulino@^0.8.0']);
    });

    test('ignores implementations whose blocks are not used', () => {
        const r = collectRequirements(entries, ['unrelated'], 'arduino:cpp');
        assert.deepStrictEqual(r, { libDeps: [] });
    });

    test('ignores non-matching runtimes and non-library deps', () => {
        const r = collectRequirements(entries, ['cloud_pub'], 'arduino:cpp');
        assert.deepStrictEqual(r, { libDeps: [] });
    });
});

suite('mergeEnvLists', () => {
    const ini = [
        '[env:mkr1010]',
        'platform = atmelsam',
        'board = mkrwifi1010',
        'framework = arduino',
        '',
        '[env:esp32]',
        'platform = espressif32',
        'board = esp32dev',
        '',
    ].join('\n');

    test('adds a new lib_deps key to the target env only', () => {
        const { content, changed } = mergeEnvLists(ini, 'mkr1010', { libDeps: ['Arduino_Modulino@^0.8.0'] });
        assert.strictEqual(changed, true);
        assert.ok(content.includes('lib_deps =\n    Arduino_Modulino@^0.8.0'), content);
        const esp = content.slice(content.indexOf('[env:esp32]'));
        assert.ok(!esp.includes('lib_deps'), content);
    });

    test('appends to existing lib_deps and de-dupes by library name', () => {
        const withDep = [
            '[env:mkr1010]',
            'framework = arduino',
            'lib_deps =',
            '    Arduino_Modulino@^0.9.0',
            '',
        ].join('\n');
        const { content, changed } = mergeEnvLists(withDep, 'mkr1010', {
            libDeps: ['Arduino_Modulino@^0.8.0', 'NewLib@^1.0.0'],
        });
        assert.strictEqual(changed, true);
        assert.ok(content.includes('Arduino_Modulino@^0.9.0'), content);
        assert.ok(!content.includes('Arduino_Modulino@^0.8.0'), content);
        assert.ok(content.includes('NewLib@^1.0.0'), content);
    });

    test('no change when everything is already present', () => {
        const withDep = '[env:mkr1010]\nlib_deps =\n    NewLib@^1.0.0\n';
        const { changed } = mergeEnvLists(withDep, 'mkr1010', { libDeps: ['NewLib@^2.0.0'] });
        assert.strictEqual(changed, false);
    });

    test('de-dupes the name=url VCS form by custom name (ref change is not a dup)', () => {
        const withVcs = [
            '[env:nesso]',
            'framework = arduino',
            'lib_deps =',
            '    Arduino_Nesso_N1=https://github.com/arduino-libraries/Arduino_Nesso_N1.git#v1.0.0',
            '',
        ].join('\n');
        const { changed } = mergeEnvLists(withVcs, 'nesso', {
            libDeps: ['Arduino_Nesso_N1=https://github.com/arduino-libraries/Arduino_Nesso_N1.git#v2.0.0'],
        });
        assert.strictEqual(changed, false);
    });

    test('returns unchanged when the env is absent', () => {
        const { content, changed } = mergeEnvLists(ini, 'nonexistent', { libDeps: ['X'] });
        assert.strictEqual(changed, false);
        assert.strictEqual(content, ini);
    });
});

suite('mergeSketchLibraries', () => {
    const sketchYaml = [
        'profiles:',
        '  nanorp:',
        '    fqbn: arduino:mbed_nano:nanorp2040connect',
        '    platforms:',
        '      - platform: arduino:mbed_nano',
        '    libraries:',
        '      - ArduinoIoTCloud (1.0.2)',
        '      - Arduino_ConnectionHandler (0.6.4)',
        '',
        '  uno:',
        '    fqbn: arduino:avr:uno',
        '    platforms:',
        '      - platform: arduino:avr',
        '',
    ].join('\n');

    test('adds a library to an existing libraries section', () => {
        const { content, changed } = mergeSketchLibraries(sketchYaml, 'nanorp', {
            libDeps: ['NewLib@^1.0.0'],
        });
        assert.strictEqual(changed, true);
        assert.ok(content.includes('- NewLib (1.0.0)'), content);
        assert.ok(content.includes('- ArduinoIoTCloud (1.0.2)'), content);
    });

    test('de-dupes by library name (case-insensitive)', () => {
        const { changed } = mergeSketchLibraries(sketchYaml, 'nanorp', {
            libDeps: ['ArduinoIoTCloud@^2.0.0'],
        });
        assert.strictEqual(changed, false);
    });

    test('converts PIO VCS format (name=url#ref) to just the name', () => {
        const { content, changed } = mergeSketchLibraries(sketchYaml, 'nanorp', {
            libDeps: ['MyLib=https://github.com/foo/MyLib.git#v1.0.0'],
        });
        assert.strictEqual(changed, true);
        assert.ok(content.includes('- MyLib'), content);
        assert.ok(!content.includes('github.com'), content);
    });

    test('adds a libraries section when the profile has none', () => {
        const { content, changed } = mergeSketchLibraries(sketchYaml, 'uno', {
            libDeps: ['Servo@^1.2.0'],
        });
        assert.strictEqual(changed, true);
        assert.ok(content.includes('libraries:'), content);
        assert.ok(content.includes('- Servo (1.2.0)'), content);
    });

    test('returns unchanged when the profile does not exist', () => {
        const { content, changed } = mergeSketchLibraries(sketchYaml, 'nonexistent', {
            libDeps: ['X@^1.0.0'],
        });
        assert.strictEqual(changed, false);
        assert.strictEqual(content, sketchYaml);
    });

    test('handles empty additions', () => {
        const { changed } = mergeSketchLibraries(sketchYaml, 'nanorp', { libDeps: [] });
        assert.strictEqual(changed, false);
    });
});
