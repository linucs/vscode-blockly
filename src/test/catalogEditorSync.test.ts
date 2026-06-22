import * as assert from 'assert';
import { isExternalChange } from '../catalog/catalogEditorSync';

suite('catalog editor re-entrancy guard (isExternalChange)', () => {
    test('our own write (text equals last synced) is not external', () => {
        assert.strictEqual(isExternalChange('id: x\n', 'id: x\n'), false);
    });

    test('a genuinely different document is external', () => {
        assert.strictEqual(isExternalChange('id: y\n', 'id: x\n'), true);
    });

    test('an EOL-only difference (CRLF file vs LF serializer) is not external', () => {
        assert.strictEqual(isExternalChange('id: x\r\nv: 1\r\n', 'id: x\nv: 1\n'), false);
    });

    test('no prior write yet → treat any change as external', () => {
        assert.strictEqual(isExternalChange('id: x\n', undefined), true);
    });
});
