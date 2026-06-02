import { httpGet } from '../catalog/remoteCatalog';

const REPOS_URL = 'https://raw.githubusercontent.com/arduino/library-registry/refs/heads/main/repositories.txt';

let cachedRepos: string[] | undefined;

async function getRepos(): Promise<string[]> {
    if (cachedRepos) return cachedRepos;
    const buf = await httpGet(REPOS_URL);
    cachedRepos = buf.toString('utf-8').split('\n').filter(l => l.trim().length > 0);
    return cachedRepos;
}

/**
 * Check whether a library is present in the Arduino Library Registry
 * (installable via `arduino-cli lib install`). Host-agnostic.
 */
export async function checkArduinoRegistry(libraryName: string): Promise<string> {
    const needle = libraryName.toLowerCase();

    try {
        const repos = await getRepos();
        const matches = repos.filter(r => r.toLowerCase().includes(needle));

        if (matches.length === 0) {
            return (
                `"${libraryName}" was NOT found in the Arduino Library Registry.\n` +
                `It is not installable via "arduino-cli lib install". ` +
                `You may need a url+ref dependency for Arduino CLI projects.`
            );
        }

        return (
            `"${libraryName}" IS in the Arduino Library Registry (installable via "arduino-cli lib install").\n` +
            `Matching entries:\n${matches.map(m => `  ${m}`).join('\n')}`
        );
    } catch (err) {
        return `Arduino registry check failed: ${err instanceof Error ? err.message : String(err)}`;
    }
}
