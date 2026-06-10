import * as assert from 'assert';
import { isImplCompatible, filterEntriesForRuntime, composeRuntime } from '../catalog/boardFilter';
import { BoardContext } from '../project/projectConfig';
import { CatalogEntry, Implementation } from '../catalog/CatalogTypes';

const ARDUINO_CPP = 'arduino:cpp';
const esp32: BoardContext = { envName: 'esp32', framework: 'arduino', platform: 'espressif32', board: 'esp32dev' };
const mkr: BoardContext = { envName: 'mkr1010', framework: 'arduino', platform: 'atmelsam', board: 'mkrwifi1010' };

function impl(runtime: string, targets?: string[]): Implementation {
    return { runtime: runtime as Implementation['runtime'], blocks: [], ...(targets ? { targets } : {}) };
}

suite('composeRuntime', () => {
    test('joins framework and language, lowercased and trimmed', () => {
        assert.strictEqual(composeRuntime('arduino', 'cpp'), 'arduino:cpp');
        assert.strictEqual(composeRuntime(' Arduino ', ' CPP '), 'arduino:cpp');
    });
});

suite('isImplCompatible — runtime match', () => {
    test('accepts an exact runtime match', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp'), esp32, ARDUINO_CPP), true);
    });

    test('rejects a different runtime', () => {
        assert.strictEqual(isImplCompatible(impl('espidf:cpp'), esp32, ARDUINO_CPP), false);
    });

    test('rejects a different framework (espidf)', () => {
        assert.strictEqual(isImplCompatible(impl('espidf:cpp'), esp32, ARDUINO_CPP), false);
    });

    test('matches case-insensitively', () => {
        assert.strictEqual(isImplCompatible(impl('Arduino:CPP'), esp32, ARDUINO_CPP), true);
    });
});

suite('isImplCompatible — targets dimension', () => {
    test('no targets means universal', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp'), mkr, ARDUINO_CPP), true);
    });

    test('matches by platform', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['espressif32']), esp32, ARDUINO_CPP), true);
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['espressif32']), mkr, ARDUINO_CPP), false);
    });

    test('matches by board id', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['mkrwifi1010']), mkr, ARDUINO_CPP), true);
    });

    test('matches case-insensitively and trims', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', [' ESPRESSIF32 ']), esp32, ARDUINO_CPP), true);
    });
});

suite('isImplCompatible — FQBN-based targets (Arduino CLI)', () => {
    const unoArduino: BoardContext = {
        envName: 'default', framework: 'arduino', platform: 'arduino:avr', board: 'uno',
        fqbn: 'arduino:avr:uno',
    };
    const nanoEsp32: BoardContext = {
        envName: 'nano', framework: 'arduino', platform: 'arduino:esp32', board: 'nano_nora',
        fqbn: 'arduino:esp32:nano_nora',
    };

    test('matches by Arduino platform identifier (vendor:arch)', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['arduino:avr']), unoArduino, ARDUINO_CPP), true);
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['arduino:avr']), nanoEsp32, ARDUINO_CPP), false);
    });

    test('matches by full FQBN', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['arduino:avr:uno']), unoArduino, ARDUINO_CPP), true);
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['arduino:avr:mega']), unoArduino, ARDUINO_CPP), false);
    });

    test('matches by board id alone (same as PIO path)', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['uno']), unoArduino, ARDUINO_CPP), true);
    });

    test('FQBN matching is case-insensitive', () => {
        assert.strictEqual(isImplCompatible(impl('arduino:cpp', ['ARDUINO:AVR']), unoArduino, ARDUINO_CPP), true);
    });
});

suite('filterEntriesForRuntime', () => {
    const entries: CatalogEntry[] = [
        { id: 'universal', category: 'U', implementations: [impl('arduino:cpp')] },
        { id: 'py-only', category: 'P', implementations: [impl('espidf:cpp')] },
        { id: 'esp-only', category: 'E', implementations: [impl('arduino:cpp', ['espressif32'])] },
        { id: 'samd-by-board', category: 'S', implementations: [impl('arduino:cpp', ['mkrwifi1010'])] },
        {
            id: 'multi-impl', category: 'M',
            implementations: [impl('espidf:cpp'), impl('arduino:cpp', ['atmelsam'])],
        },
    ];

    test('keeps only runtime+board compatible entries (mkr1010)', () => {
        assert.deepStrictEqual(
            filterEntriesForRuntime(entries, mkr, ARDUINO_CPP).map(e => e.id),
            ['universal', 'samd-by-board', 'multi-impl']
        );
    });

    test('keeps only runtime+board compatible entries (esp32)', () => {
        assert.deepStrictEqual(
            filterEntriesForRuntime(entries, esp32, ARDUINO_CPP).map(e => e.id),
            ['universal', 'esp-only']
        );
    });

    test('a different runtime matches nothing', () => {
        assert.deepStrictEqual(filterEntriesForRuntime(entries, esp32, 'zephyr:cpp'), []);
    });

    test('narrows a kept entry to its compatible implementations only', () => {
        const multi = filterEntriesForRuntime(entries, mkr, ARDUINO_CPP).find(e => e.id === 'multi-impl')!;
        assert.strictEqual(multi.implementations.length, 1);
        assert.strictEqual(multi.implementations[0].runtime, 'arduino:cpp');
    });

    test('does not mutate the input entries', () => {
        const before = entries.find(e => e.id === 'multi-impl')!.implementations.length;
        filterEntriesForRuntime(entries, mkr, ARDUINO_CPP);
        assert.strictEqual(entries.find(e => e.id === 'multi-impl')!.implementations.length, before);
    });
});
