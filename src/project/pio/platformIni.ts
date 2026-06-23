import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectConfig, ProjectEnv } from '../projectConfig';

/**
 * Minimal INI parser for platformio.ini.
 *
 * Supports the subset that matters for block compatibility:
 *  - [platformio] default_envs (comma- or newline-separated)
 *  - [env] shared base options inherited by every [env:NAME]
 *  - [env:NAME] per-environment platform / board / framework
 *  - ; and # line comments, multi-line values (continuation lines)
 *
 * Not supported (yet): `extends`, interpolation (${...}), include files.
 */
export function parsePlatformIni(content: string): { defaultEnvs: string[]; envs: ProjectEnv[] } {
    const sections = new Map<string, Record<string, string>>();
    let current: Record<string, string> | null = null;
    let lastKey: string | null = null;

    for (const rawLine of content.split(/\r?\n/)) {
        if (lastKey && current && /^\s+\S/.test(rawLine) && !rawLine.trimStart().startsWith('[')) {
            const cont = stripComment(rawLine).trim();
            if (cont) {current[lastKey] += '\n' + cont;}
            continue;
        }

        const line = stripComment(rawLine).trim();
        if (!line) {continue;}

        const sectionMatch = /^\[(.+)\]$/.exec(line);
        if (sectionMatch) {
            const name = sectionMatch[1].trim();
            current = {};
            sections.set(name, current);
            lastKey = null;
            continue;
        }

        const eq = line.indexOf('=');
        if (eq === -1 || !current) {continue;}
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        current[key] = value;
        lastKey = key;
    }

    const defaultEnvs = splitList(sections.get('platformio')?.['default_envs'] ?? '');
    const base = sections.get('env') ?? {};

    const envs: ProjectEnv[] = [];
    for (const [name, opts] of sections) {
        if (!name.startsWith('env:')) {continue;}
        const merged = { ...base, ...opts };
        envs.push({
            name: name.slice('env:'.length).trim(),
            platform: merged['platform']?.trim() || undefined,
            board: merged['board']?.trim() || undefined,
            framework: merged['framework']?.trim() || undefined,
        });
    }

    return { defaultEnvs, envs };
}

function stripComment(line: string): string {
    const semi = line.indexOf(';');
    const hash = line.indexOf('#');
    let cut = -1;
    if (semi !== -1) {cut = semi;}
    if (hash !== -1 && (cut === -1 || hash < cut)) {cut = hash;}
    return cut === -1 ? line : line.slice(0, cut);
}

function splitList(value: string): string[] {
    return value
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Walk up from a starting file/dir path looking for a platformio.ini.
 * Returns its absolute path, or undefined if none is found up to the FS root.
 */
export async function findPlatformIni(startFsPath: string): Promise<string | undefined> {
    let dir = startFsPath;
    try {
        if ((await fs.stat(startFsPath)).isFile()) {dir = path.dirname(startFsPath);}
    } catch {
        dir = path.dirname(startFsPath);
    }

    let prev = '';
    while (dir && dir !== prev) {
        const candidate = path.join(dir, 'platformio.ini');
        try {
            if ((await fs.stat(candidate)).isFile()) {return candidate;}
        } catch { /* not here, keep climbing */ }
        prev = dir;
        dir = path.dirname(dir);
    }
    return undefined;
}

/** Locate and parse the platformio.ini governing the given document path. */
export async function loadPlatformioProject(documentFsPath: string): Promise<ProjectConfig | undefined> {
    const iniPath = await findPlatformIni(documentFsPath);
    if (!iniPath) {return undefined;}
    try {
        const content = await fs.readFile(iniPath, 'utf-8');
        const { defaultEnvs, envs } = parsePlatformIni(content);
        return { configPath: iniPath, configType: 'platformio', envs, defaultEnvs };
    } catch {
        return undefined;
    }
}
