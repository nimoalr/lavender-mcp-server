import { context, build } from 'esbuild';
import { rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

const common = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    legalComments: 'none',
    logLevel: 'info',
    sourcemap: false,
};

const configs = [
    { ...common, entryPoints: ['src/server/index.ts'], outfile: 'dist/server.js' },
    { ...common, entryPoints: ['src/client/index.ts'], outfile: 'dist/client.js' },
];

await rm('dist', { recursive: true, force: true });

if (watch) {
    const ctxs = await Promise.all(configs.map((c) => context(c)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('esbuild: watching for changes');
} else {
    await Promise.all(configs.map((c) => build(c)));
}
