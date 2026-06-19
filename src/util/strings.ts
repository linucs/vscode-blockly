/**
 * Turn a kebab/snake/space identifier into a human-readable Title Case label,
 * e.g. `dht11-sensor` → `Dht11 Sensor`. Shared by the catalog tree views so a
 * catalog `id` renders consistently wherever it's shown.
 */
export function titleCase(s: string): string {
    return s.replace(/(^|[-_ ])(\w)/g, (_, sep, c) => (sep === '-' || sep === '_' ? ' ' : sep) + c.toUpperCase());
}
