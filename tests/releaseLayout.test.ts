import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LUA_EXECUTOR_EXPORT } from '../src/shared/luaExecutor';

describe('release layout', () => {
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
});
