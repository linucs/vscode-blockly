import * as assert from 'assert';
import { parseSketchYaml } from '../project/arduino/sketchYaml';
import { mergeSketchLibraries } from '../project/arduino/sketchYamlMerge';
import { DEFAULT_ENV_NAME } from '../project/projectConfig';

suite('sketch.yaml parser', () => {
    test('parses a profile with fqbn and platforms', () => {
        const { envs, defaultEnvs } = parseSketchYaml(`
profiles:
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
    platforms:
      - platform: arduino:mbed_nano
    libraries:
      - ArduinoIoTCloud (1.0.2)
`);
        assert.deepStrictEqual(defaultEnvs, []);
        assert.strictEqual(envs.length, 1);
        assert.strictEqual(envs[0].name, 'nanorp');
        assert.strictEqual(envs[0].fqbn, 'arduino:mbed_nano:nanorp2040connect');
        assert.strictEqual(envs[0].board, 'nanorp2040connect');
        assert.strictEqual(envs[0].framework, 'arduino');
        assert.strictEqual(envs[0].platform, 'arduino:mbed_nano');
    });

    test('derives platform from FQBN when platforms section is absent', () => {
        const { envs } = parseSketchYaml(`
profiles:
  uno:
    fqbn: arduino:avr:uno
`);
        assert.strictEqual(envs[0].platform, 'arduino:avr');
        assert.strictEqual(envs[0].board, 'uno');
    });

    test('parses multiple profiles', () => {
        const { envs } = parseSketchYaml(`
profiles:
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
    platforms:
      - platform: arduino:mbed_nano
  uno:
    fqbn: arduino:avr:uno
    platforms:
      - platform: arduino:avr
`);
        assert.strictEqual(envs.length, 2);
        assert.strictEqual(envs[0].name, 'nanorp');
        assert.strictEqual(envs[1].name, 'uno');
    });

    test('reads default_profile', () => {
        const { defaultEnvs } = parseSketchYaml(`
default_profile: nanorp
profiles:
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
`);
        assert.deepStrictEqual(defaultEnvs, ['nanorp']);
    });

    test('handles empty / missing profiles', () => {
        assert.deepStrictEqual(parseSketchYaml('').envs, []);
        assert.deepStrictEqual(parseSketchYaml('profiles:').envs, []);
        assert.deepStrictEqual(parseSketchYaml('something_else: true').envs, []);
    });

    test('framework is always "arduino" for any FQBN vendor', () => {
        const { envs } = parseSketchYaml(`
profiles:
  esp:
    fqbn: esp32:esp32:esp32dev
`);
        assert.strictEqual(envs[0].framework, 'arduino');
        assert.strictEqual(envs[0].board, 'esp32dev');
        assert.strictEqual(envs[0].platform, 'esp32:esp32');
    });

    test('handles FQBN with only two parts', () => {
        const { envs } = parseSketchYaml(`
profiles:
  minimal:
    fqbn: arduino:avr
`);
        assert.strictEqual(envs[0].board, undefined);
        assert.strictEqual(envs[0].platform, 'arduino:avr');
        assert.strictEqual(envs[0].framework, 'arduino');
    });

    test('handles profile without fqbn', () => {
        const { envs } = parseSketchYaml(`
profiles:
  empty:
    notes: just a placeholder
`);
        assert.strictEqual(envs[0].fqbn, undefined);
        assert.strictEqual(envs[0].board, undefined);
        assert.strictEqual(envs[0].framework, undefined);
    });

    test('synthesizes env from default_fqbn when no profiles exist', () => {
        const { envs } = parseSketchYaml(`
default_fqbn: arduino:avr:uno
default_port: /dev/cu.usbmodem11101
default_protocol: serial
`);
        assert.strictEqual(envs.length, 1);
        assert.strictEqual(envs[0].name, DEFAULT_ENV_NAME);
        assert.strictEqual(envs[0].fqbn, 'arduino:avr:uno');
        assert.strictEqual(envs[0].board, 'uno');
        assert.strictEqual(envs[0].framework, 'arduino');
        assert.strictEqual(envs[0].platform, 'arduino:avr');
    });

    test('does NOT synthesize from default_fqbn when profiles exist', () => {
        const { envs } = parseSketchYaml(`
default_fqbn: arduino:avr:uno
profiles:
  nanorp:
    fqbn: arduino:mbed_nano:nanorp2040connect
`);
        assert.strictEqual(envs.length, 1);
        assert.strictEqual(envs[0].name, 'nanorp');
    });
});

suite('sketch.yaml merge — default env (no profile)', () => {
    // When no real profile exists, the active env is the in-memory env
    // synthesized from default_fqbn (name === DEFAULT_ENV_NAME). The project is
    // then in arduino-cli's profile-less/global mode, where sketch.yaml is not
    // consulted for libraries — so blockly must write nothing. It must never
    // synthesize a profile (that would be incomplete and oversteps arduino-cli's
    // ownership of profile creation).
    test('is a no-op when profileName is the default env, even with default_fqbn', () => {
        const input = [
            'default_fqbn: arduino:avr:uno',
            'default_port: /dev/cu.usbmodem11101',
            'default_protocol: serial',
        ].join('\n');

        const { content, changed } = mergeSketchLibraries(input, DEFAULT_ENV_NAME, {
            libDeps: ['Servo@^1.2.1'],
        });
        assert.ok(!changed);
        assert.strictEqual(content, input);
    });

    test('is a no-op when default_fqbn is missing', () => {
        const input = 'default_port: /dev/cu.usbmodem11101\n';
        const { content, changed } = mergeSketchLibraries(input, DEFAULT_ENV_NAME, {
            libDeps: ['Servo@^1.2.1'],
        });
        assert.ok(!changed);
        assert.strictEqual(content, input);
    });

    test('is a no-op with multiple libraries (no profile synthesized)', () => {
        const input = 'default_fqbn: esp32:esp32:esp32dev\n';
        const { content, changed } = mergeSketchLibraries(input, DEFAULT_ENV_NAME, {
            libDeps: ['WiFi', 'ArduinoJson@^6.21.0'],
        });
        assert.ok(!changed);
        assert.strictEqual(content, input);
        assert.ok(!content.includes('profiles:'));
    });
});
