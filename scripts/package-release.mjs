import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const fxmanifest = await readFile(path.join(root, 'fxmanifest.lua'), 'utf8');
const declaredVersion = /\bversion\s+['"]([^'"]+)['"]/.exec(fxmanifest)?.[1];

if (declaredVersion !== manifest.version) {
    throw new Error(
        `Version mismatch: package.json=${manifest.version}, fxmanifest.lua=${declaredVersion ?? 'missing'}`,
    );
}

const releaseRoot = path.join(root, '.release');
const resourceRoot = path.join(releaseRoot, 'lavender-mcp-server');
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(resourceRoot, { recursive: true });

await cp(path.join(root, 'dist'), path.join(resourceRoot, 'dist'), { recursive: true });

for (const filename of [
    'fxmanifest.lua',
    'README.md',
    'EXTENDING.md',
    'LICENSE',
    'THIRD_PARTY_LICENSES.txt',
]) {
    await cp(path.join(root, filename), path.join(resourceRoot, filename));
}

console.log(`Prepared .release/lavender-mcp-server ${manifest.version}.`);
