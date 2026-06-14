import { ProjectBackend } from '../projectBackend';
import { findAppYaml, loadAppLabProject, sketchYamlPathFor, requirementsTxtPathFor } from './appYaml';
import { mergeRequirementsTxt, mergeAppYamlBricks } from './appYamlMerge';
import { mergeSketchLibraries } from '../arduino/sketchYamlMerge';

/**
 * Arduino App Lab backend (axis 3): config file `app.yaml`. Dependencies are
 * routed to three files, each owned by a different bucket:
 *   - `pip`     → `python/requirements.txt`
 *   - `brick`   → `app.yaml` (`bricks:`)
 *   - `library` → `sketch/sketch.yaml` (`libraries:`, via the Arduino merge)
 *
 * Each target file is read fresh immediately before its synchronous merge+write,
 * matching the TOCTOU discipline of the Arduino backend (the App Lab daemon may
 * rewrite these files out of band).
 */
export const appLabBackend: ProjectBackend = {
    configType: 'app-lab',
    label: 'Arduino App Lab',
    fileLabel: 'app.yaml',
    find: findAppYaml,
    load: loadAppLabProject,
    async sync(ctx) {
        const { pip, brick, library } = ctx.requirements;
        const appYamlPath = ctx.project.configPath;

        // pip → python/requirements.txt (created if absent).
        if (pip.length > 0) {
            const reqPath = requirementsTxtPathFor(appYamlPath);
            const content = (await ctx.readFile(reqPath)) ?? '';
            const { content: merged, changed } = mergeRequirementsTxt(content, pip);
            if (changed) await ctx.writeFile(reqPath, merged);
        }

        // brick → app.yaml bricks:.
        if (brick.length > 0) {
            const content = await ctx.readFile(appYamlPath);
            if (content !== undefined) {
                const { content: merged, changed } = mergeAppYamlBricks(content, brick);
                if (changed) await ctx.writeFile(appYamlPath, merged);
            }
        }

        // library → sketch/sketch.yaml (Arduino CLI library format).
        if (library.length > 0) {
            const sketchPath = sketchYamlPathFor(appYamlPath);
            const content = await ctx.readFile(sketchPath);
            if (content !== undefined) {
                const { content: merged, changed } =
                    mergeSketchLibraries(content, ctx.activeEnv.name, library);
                if (changed) await ctx.writeFile(sketchPath, merged);
            }
        }
    },
};
