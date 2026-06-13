import { ProjectBackend } from '../projectBackend';
import { findPlatformIni, loadPlatformioProject } from './platformIni';
import { mergeEnvLists, composePioLibDep } from './iniMerge';

/** PlatformIO backend: dependencies go to `platformio.ini` `lib_deps`. */
export const platformioBackend: ProjectBackend = {
    configType: 'platformio',
    label: 'PlatformIO',
    fileLabel: 'platformio.ini',
    find: findPlatformIni,
    load: loadPlatformioProject,
    async sync(ctx) {
        const libDeps = ctx.requirements.library.map(composePioLibDep);
        if (libDeps.length === 0) return;
        const path = ctx.project.configPath;
        // Read fresh immediately before the synchronous merge+write below.
        const content = await ctx.readFile(path);
        if (content === undefined) return;
        const { content: merged, changed } = mergeEnvLists(content, ctx.activeEnv.name, { libDeps });
        if (changed) await ctx.writeFile(path, merged);
    },
};
