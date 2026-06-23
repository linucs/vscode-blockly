import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { mergeRequirementsTxt, mergeAppYamlBricks } from '../project/applab/appYamlMerge';
import { findAppYaml, loadAppLabProject } from '../project/applab/appYaml';
import { selectBackend } from '../project/backendRegistry';

suite('mergeRequirementsTxt', () => {
    test('appends missing packages, de-dupes by name (case-insensitive)', () => {
        const { content, changed } = mergeRequirementsTxt(
            'numpy>=1.0\nRequests\n',
            [{ type: 'pip', name: 'requests' }, { type: 'pip', name: 'pillow', minVersion: '10.0' }],
        );
        assert.strictEqual(changed, true);
        assert.ok(content.includes('numpy>=1.0'));
        assert.ok(!/requests[\s\S]*requests/i.test(content), 'requests should not be duplicated');
        assert.ok(content.includes('pillow>=10.0'), content);
    });

    test('creates content from empty file', () => {
        const { content, changed } = mergeRequirementsTxt('', [{ type: 'pip', name: 'flask' }]);
        assert.strictEqual(changed, true);
        assert.strictEqual(content, 'flask\n');
    });

    test('no-op when all present', () => {
        const { changed } = mergeRequirementsTxt('flask\n', [{ type: 'pip', name: 'flask' }]);
        assert.strictEqual(changed, false);
    });
});

suite('mergeAppYamlBricks', () => {
    test('appends a brick with variables into an existing bricks: list', () => {
        const input = 'name: Demo\nbricks:\n  - arduino:simple_string\n';
        const { content, changed } = mergeAppYamlBricks(input, [
            { type: 'brick', name: 'arduino:object_detection', variables: { MODEL: 'yolo' } },
        ]);
        assert.strictEqual(changed, true);
        assert.ok(content.includes('- arduino:object_detection:'), content);
        assert.ok(content.includes('      variables:'), content);
        assert.ok(content.includes('        MODEL: yolo'), content);
    });

    test('de-dupes by brick id', () => {
        const input = 'bricks:\n  - arduino:simple_string\n';
        const { changed } = mergeAppYamlBricks(input, [{ type: 'brick', name: 'arduino:simple_string' }]);
        assert.strictEqual(changed, false);
    });

    test('creates a bricks: section when none exists', () => {
        const { content, changed } = mergeAppYamlBricks('name: Demo\n', [{ type: 'brick', name: 'arduino:foo' }]);
        assert.strictEqual(changed, true);
        assert.ok(/bricks:\n {2}- arduino:foo/.test(content), content);
    });
});

suite('App Lab project detection', () => {
    let root = '';

    suiteSetup(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'applab-'));
        await fs.mkdir(path.join(root, 'python'), { recursive: true });
        await fs.mkdir(path.join(root, 'sketch'), { recursive: true });
        await fs.writeFile(path.join(root, 'app.yaml'), 'name: Demo\ndescription: Demo app\n');
        await fs.writeFile(path.join(root, 'python', 'main.py'), '# entry\n');
        await fs.writeFile(
            path.join(root, 'sketch', 'sketch.yaml'),
            'profiles:\n  default:\n    fqbn: arduino:zephyr:nesso\ndefault_profile: default\n',
        );
        await fs.writeFile(path.join(root, 'sketch', 'sketch.ino'), '// sketch\n');
    });

    suiteTeardown(async () => {
        if (root) {await fs.rm(root, { recursive: true, force: true });}
    });

    test('findAppYaml walks up from python/main.py', async () => {
        const found = await findAppYaml(path.join(root, 'python', 'main.py'));
        assert.strictEqual(found, path.join(root, 'app.yaml'));
    });

    test('loadAppLabProject derives board from embedded sketch.yaml, framework=arduino', async () => {
        const project = await loadAppLabProject(path.join(root, 'python', 'main.py'));
        assert.ok(project);
        assert.strictEqual(project!.configType, 'app-lab');
        assert.strictEqual(project!.configPath, path.join(root, 'app.yaml'));
        assert.strictEqual(project!.envs[0].framework, 'arduino');
        assert.strictEqual(project!.envs[0].board, 'nesso');
    });

    test('opening main.py resolves to the App Lab backend (single match)', async () => {
        const backend = await selectBackend(path.join(root, 'python', 'main.py'));
        assert.strictEqual(backend?.configType, 'app-lab');
    });

    test('opening sketch.ino resolves to the Arduino backend (deeper sketch.yaml wins)', async () => {
        const backend = await selectBackend(path.join(root, 'sketch', 'sketch.ino'));
        assert.strictEqual(backend?.configType, 'arduino');
    });
});
