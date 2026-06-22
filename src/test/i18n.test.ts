import * as assert from 'assert';
import * as yaml from 'js-yaml';
import type { CatalogEntry } from '../catalog/CatalogTypes';
import { serializeWorkspace } from '../catalog/serialize';
import { importCatalog } from '../catalog/serialize/import';
import type { MetaBlock, MetaWorkspace } from '../catalog/serialize/types';
import { deepEqual } from '../catalog/serialize/normalize';
import { i18nDisplay, i18nFromEntries, isI18nMap, primaryLocale } from '../catalog/serialize/i18n';

function serialize(yamlText: string): string {
    const spec = importCatalog(yamlText);
    const ws: MetaWorkspace = { getTopBlocks: () => (spec ? [spec as unknown as MetaBlock] : []) };
    return serializeWorkspace(ws);
}

suite('i18n primary = first key (M6)', () => {
    test('primaryLocale / i18nDisplay use the first key, not a hardcoded "en"', () => {
        const itFirst = { it: 'ritardo', en: 'delay' };
        assert.strictEqual(primaryLocale(itFirst), 'it');
        assert.strictEqual(i18nDisplay(itFirst), 'ritardo');
        // en-first still resolves to en (the corpus convention is unaffected).
        assert.strictEqual(primaryLocale({ en: 'delay', it: 'ritardo' }), 'en');
        assert.strictEqual(i18nDisplay({ en: 'delay', it: 'ritardo' }), 'delay');
        // scalar / undefined have no primary.
        assert.strictEqual(primaryLocale('plain'), undefined);
        assert.strictEqual(primaryLocale(undefined), undefined);
    });
});

suite('i18nFromEntries (dialog → I18nText)', () => {
    test('collapses a single surviving locale to a scalar string', () => {
        assert.strictEqual(i18nFromEntries([['en', 'hello'], ['it', '']]), 'hello');
    });

    test('builds an ordered map (primary first) for two or more locales', () => {
        const out = i18nFromEntries([['it', 'ciao'], ['en', 'hi']]);
        assert.ok(isI18nMap(out));
        assert.deepStrictEqual(Object.keys(out as object), ['it', 'en']);
    });

    test('returns an empty string when every row is empty', () => {
        assert.strictEqual(i18nFromEntries([['en', ''], ['it', '']]), '');
    });
});

suite('locale-map ordering is preserved through serialization', () => {
    const IT_FIRST = `
id: demo
category: "I/O::Digital"
description:
  it: "Pin digitali."
  en: "Digital pins."
implementations:
  - runtime: "arduino:cpp"
    blocks:
      - blockly:
          type: t
          message0:
            it: "ritardo %1"
            en: "delay %1"
          args0:
            - type: input_value
              name: MS
          previousStatement: null
          nextStatement: null
`;

    test('an it-first map keeps it before en in the emitted YAML', () => {
        const out = serialize(IT_FIRST);
        const descIt = out.indexOf('Pin digitali');
        const descEn = out.indexOf('Digital pins');
        assert.ok(descIt >= 0 && descEn >= 0 && descIt < descEn, out);
    });

    test('an it-first multi-locale catalog round-trips semantically', () => {
        const result = yaml.load(serialize(IT_FIRST)) as CatalogEntry;
        assert.ok(deepEqual(yaml.load(IT_FIRST), result), 'it-first round-trip is identical');
    });
});
