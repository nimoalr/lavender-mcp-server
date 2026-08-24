import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LUA_EXECUTOR_EXPORT } from '../src/shared/luaExecutor';

describe('release layout', () => {
    it('keeps package and resource versions aligned', async () => {
        const manifest = await readFile('fxmanifest.lua', 'utf8');
        const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
            version: string;
        };

        expect(manifest).toContain(`version '${packageJson.version}'`);
    });

    it('loads the Lua evaluator before both JavaScript bundles', async () => {
        const manifest = await readFile('fxmanifest.lua', 'utf8');
        const luaEntries = [...manifest.matchAll(/'runtime\/luaExecutor\.lua'/g)];

        expect(luaEntries).toHaveLength(3);
        expect(manifest.indexOf("'runtime/luaExecutor.lua'")).toBeLessThan(
            manifest.indexOf("'dist/server.js'"),
        );
        expect(manifest.lastIndexOf("'runtime/luaExecutor.lua'", manifest.indexOf("'dist/client.js'")))
            .toBeLessThan(manifest.indexOf("'dist/client.js'"));
    });

    it('packages the runtime directory and keeps the bridge export names aligned', async () => {
        const packaging = await readFile('scripts/package-release.mjs', 'utf8');
        const luaSource = await readFile('runtime/luaExecutor.lua', 'utf8');

        expect(packaging).toContain("['dist', 'runtime']");
        expect(luaSource).toContain(`exports('${LUA_EXECUTOR_EXPORT}', executeLua)`);
    });

    it('builds the game client as a plain script rather than CommonJS', async () => {
        const buildScript = await readFile('build.mjs', 'utf8');

        expect(buildScript).toMatch(
            /platform: 'browser',\s+format: 'iife',\s+entryPoints: \['src\/client\/index\.ts'\]/,
        );
    });

    it('creates a version tag and release after successful main-branch CI', async () => {
        const workflow = await readFile('.github/workflows/release.yml', 'utf8');

        expect(workflow).toContain('workflow_run:');
        expect(workflow).toContain('github.event.workflow_run.conclusion == \'success\'');
        expect(workflow).toContain('github.event.workflow_run.head_branch == \'main\'');
        expect(workflow).toContain('gh release create "$RELEASE_TAG"');
        expect(workflow).toContain('--target "$RELEASE_COMMIT"');
        expect(workflow).not.toMatch(/^\s+tags:/m);
    });
});
