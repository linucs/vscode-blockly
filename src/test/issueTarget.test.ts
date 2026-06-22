import * as assert from 'assert';
import { issueTarget } from '../catalog/issueTarget';

suite('issueTarget', () => {
    test('maps a Block scope to its authored type', () => {
        assert.deepStrictEqual(issueTarget('Block "cpp_pin_mode"'), { kind: 'block', type: 'cpp_pin_mode' });
    });

    test('maps a Catalog scope to its id', () => {
        assert.deepStrictEqual(issueTarget('Catalog "arduino-demo"'), { kind: 'catalog', id: 'arduino-demo' });
    });

    test('preserves quotes/spaces inside the captured name', () => {
        assert.deepStrictEqual(issueTarget('Block "my block"'), { kind: 'block', type: 'my block' });
    });

    test('returns null for unmappable scopes', () => {
        assert.strictEqual(issueTarget('Doc 1'), null);
        assert.strictEqual(issueTarget(''), null);
        assert.strictEqual(issueTarget('runtime "arduino:cpp"'), null);
    });
});
