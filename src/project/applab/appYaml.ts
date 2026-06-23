import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectConfig, ProjectEnv } from '../projectConfig';
import { parseSketchYaml } from '../arduino/sketchYaml';

/**
 * Arduino App Lab project backend descriptor parsing.
 *
 * An App Lab app is a folder with a top-level `app.yaml` (name/description/
 * ports/bricks — it carries NO board/FQBN), a `python/main.py` entry point, and
 * an optional `sketch/sketch.yaml` that holds the board/FQBN for the MCU side.
 * The blocks editor opens on `python/main.py`; the language (`python`) comes
 * from the file extension and the framework is always `arduino`, so the runtime
 * composes to `arduino:python`.
 *
 * Layout:
 *   my-app/
 *   ├── app.yaml              ← this backend's config file
 *   ├── python/main.py        ← Python source (+ requirements.txt for pip deps)
 *   └── sketch/sketch.yaml    ← board/FQBN + C++ libraries (Arduino CLI format)
 */

/** Path to the embedded Arduino sketch.yaml for an app rooted at `appYamlPath`. */
export function sketchYamlPathFor(appYamlPath: string): string {
    return path.join(path.dirname(appYamlPath), 'sketch', 'sketch.yaml');
}

/** Path to the Python requirements.txt for an app rooted at `appYamlPath`. */
export function requirementsTxtPathFor(appYamlPath: string): string {
    return path.join(path.dirname(appYamlPath), 'python', 'requirements.txt');
}

/** Walk up from a starting file/dir path looking for an app.yaml. */
export async function findAppYaml(startFsPath: string): Promise<string | undefined> {
    let dir = startFsPath;
    try {
        if ((await fs.stat(startFsPath)).isFile()) {dir = path.dirname(startFsPath);}
    } catch {
        dir = path.dirname(startFsPath);
    }

    let prev = '';
    while (dir && dir !== prev) {
        const candidate = path.join(dir, 'app.yaml');
        try {
            if ((await fs.stat(candidate)).isFile()) {return candidate;}
        } catch { /* keep climbing */ }
        prev = dir;
        dir = path.dirname(dir);
    }
    return undefined;
}

/**
 * Locate and load the App Lab project governing the given document path.
 *
 * The board/FQBN comes from the embedded `sketch/sketch.yaml` (parsed with the
 * Arduino CLI parser). `framework` is forced to `arduino` on every env — App Lab
 * is intrinsically an Arduino runtime, so `arduino:python` composes even for a
 * Python-only app with no `sketch/` folder.
 */
export async function loadAppLabProject(documentFsPath: string): Promise<ProjectConfig | undefined> {
    const appYamlPath = await findAppYaml(documentFsPath);
    if (!appYamlPath) {return undefined;}

    let envs: ProjectEnv[] = [];
    let defaultEnvs: string[] = [];

    try {
        const sketchContent = await fs.readFile(sketchYamlPathFor(appYamlPath), 'utf-8');
        const parsed = parseSketchYaml(sketchContent);
        envs = parsed.envs;
        defaultEnvs = parsed.defaultEnvs;
    } catch { /* no embedded sketch.yaml — Python-only app */ }

    // App Lab is always Arduino; force the framework so the runtime composes to
    // arduino:python regardless of board presence.
    envs = envs.map(e => ({ ...e, framework: 'arduino' }));
    if (envs.length === 0) {
        envs = [{ name: '', framework: 'arduino' }];
    }

    return { configPath: appYamlPath, configType: 'app-lab', envs, defaultEnvs };
}
