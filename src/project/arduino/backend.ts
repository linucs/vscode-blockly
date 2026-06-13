import { ProjectBackend } from '../projectBackend';
import { findSketchYaml, loadArduinoProject } from './sketchYaml';
import { mergeSketchLibraries } from './sketchYamlMerge';

/** Arduino CLI backend: dependencies go to `sketch.yaml` `libraries`. */
export const arduinoBackend: ProjectBackend = {
    configType: 'arduino',
    label: 'Arduino CLI',
    fileLabel: 'sketch.yaml',
    find: findSketchYaml,
    load: loadArduinoProject,
    async sync(ctx) {
        if (ctx.requirements.library.length === 0) return;
        const path = ctx.project.configPath;
        // Read fresh immediately before the synchronous merge+write: the optional
        // vscode-arduino-cli daemon reformats this whole file on lib add/remove,
        // so starting from the current on-disk content minimizes lost updates.
        const content = await ctx.readFile(path);
        if (content === undefined) return;
        const { content: merged, changed } =
            mergeSketchLibraries(content, ctx.activeEnv.name, ctx.requirements.library);
        if (changed) await ctx.writeFile(path, merged);
    },
};
