import * as assert from 'assert';
import {
    parsePlatformIni,
} from '../project/pio/platformIni';
import {
    resolveActiveEnv,
    toBoardContext,
    ProjectConfig,
} from '../project/projectConfig';

suite('platformio.ini parser', () => {
    test('parses a single env with platform/board/framework', () => {
        const { envs, defaultEnvs } = parsePlatformIni(`
[env:uno]
platform = atmelavr
board = uno
framework = arduino
`);
        assert.deepStrictEqual(defaultEnvs, []);
        assert.strictEqual(envs.length, 1);
        assert.deepStrictEqual(envs[0], {
            name: 'uno',
            platform: 'atmelavr',
            board: 'uno',
            framework: 'arduino',
        });
    });

    test('inherits options from the shared [env] base section', () => {
        const { envs } = parsePlatformIni(`
[env]
framework = arduino

[env:mkr1010]
platform = atmelsam
board = mkrwifi1010

[env:esp32]
platform = espressif32
board = esp32dev
`);
        assert.strictEqual(envs.length, 2);
        assert.strictEqual(envs[0].framework, 'arduino');
        assert.strictEqual(envs[1].framework, 'arduino');
        assert.strictEqual(envs[0].board, 'mkrwifi1010');
    });

    test('per-env option overrides the [env] base', () => {
        const { envs } = parsePlatformIni(`
[env]
framework = arduino

[env:custom]
framework = espidf
platform = espressif32
`);
        assert.strictEqual(envs[0].framework, 'espidf');
    });

    test('reads default_envs (comma- and newline-separated)', () => {
        assert.deepStrictEqual(
            parsePlatformIni(`[platformio]\ndefault_envs = a, b ,c`).defaultEnvs,
            ['a', 'b', 'c']
        );
        assert.deepStrictEqual(
            parsePlatformIni(`[platformio]\ndefault_envs =\n  a\n  b`).defaultEnvs,
            ['a', 'b']
        );
    });

    test('ignores comments (; and #) and blank lines', () => {
        const { envs } = parsePlatformIni(`
; a comment
[env:uno]   # trailing comment
board = uno  ; inline comment
`);
        assert.strictEqual(envs[0].board, 'uno');
    });

    test('treats a stray leading space on a value gracefully', () => {
        const { envs } = parsePlatformIni(`[env:uno]\nplatform =    atmelavr   `);
        assert.strictEqual(envs[0].platform, 'atmelavr');
    });

    test('a missing option becomes undefined, not empty string', () => {
        const { envs } = parsePlatformIni(`[env:bare]\nboard = nano`);
        assert.strictEqual(envs[0].platform, undefined);
        assert.strictEqual(envs[0].framework, undefined);
    });
});

suite('resolveActiveEnv', () => {
    const project: ProjectConfig = {
        configPath: '/x/platformio.ini',
        configType: 'platformio',
        defaultEnvs: ['esp32'],
        envs: [
            { name: 'mkr1010', platform: 'atmelsam', board: 'mkrwifi1010', framework: 'arduino' },
            { name: 'esp32', platform: 'espressif32', board: 'esp32dev', framework: 'arduino' },
        ],
    };

    test('honours a valid requested env', () => {
        assert.strictEqual(resolveActiveEnv(project, 'mkr1010')?.name, 'mkr1010');
    });

    test('falls back to default_envs when the requested env is unknown', () => {
        assert.strictEqual(resolveActiveEnv(project, 'does-not-exist')?.name, 'esp32');
    });

    test('falls back to the first env when there is no default_envs', () => {
        const noDefault: ProjectConfig = { ...project, defaultEnvs: [] };
        assert.strictEqual(resolveActiveEnv(noDefault)?.name, 'mkr1010');
    });

    test('returns undefined for a project with no envs', () => {
        assert.strictEqual(
            resolveActiveEnv({ configPath: '/x', configType: 'platformio', defaultEnvs: [], envs: [] }),
            undefined
        );
    });

    test('finds the default env when requested is empty string', () => {
        const withDefault: ProjectConfig = {
            configPath: '/x',
            configType: 'arduino',
            defaultEnvs: [],
            envs: [{ name: '', platform: 'arduino:avr', board: 'uno', framework: 'arduino' }],
        };
        assert.strictEqual(resolveActiveEnv(withDefault, '')?.board, 'uno');
    });

    test('toBoardContext carries env name and board fields', () => {
        assert.deepStrictEqual(toBoardContext(project.envs[1]), {
            envName: 'esp32',
            platform: 'espressif32',
            board: 'esp32dev',
            framework: 'arduino',
            fqbn: undefined,
        });
    });
});
