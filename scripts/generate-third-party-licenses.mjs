import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(root, 'THIRD_PARTY_LICENSES.txt');
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const packages = new Map();

for (const [installedPath, entry] of Object.entries(lock.packages)) {
    if (!installedPath.startsWith('node_modules/') || entry.dev) continue;

    const packageDir = path.join(root, installedPath);
    const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
    const key = `${manifest.name}@${manifest.version}`;
    const current = packages.get(key);
    if (current && current.installedPath.length <= installedPath.length) continue;

    packages.set(key, {
        key,
        name: manifest.name,
        version: manifest.version,
        license: readLicenseExpression(manifest),
        source: readRepository(manifest),
        installedPath,
        licenseText: await readLicenseText(packageDir, key),
    });
}

const sorted = [...packages.values()].sort((a, b) => a.key.localeCompare(b.key));
const content = render(sorted);

if (process.argv.includes('--check')) {
    let existing = '';
    try {
        existing = await readFile(outputPath, 'utf8');
    } catch {}
    if (existing !== content) {
        console.error('THIRD_PARTY_LICENSES.txt is out of date. Run `npm run licenses`.');
        process.exitCode = 1;
    }
} else {
    await writeFile(outputPath, content, 'utf8');
    console.log(`Wrote THIRD_PARTY_LICENSES.txt for ${sorted.length} production packages.`);
}

function readLicenseExpression(manifest) {
    const value = typeof manifest.license === 'string' ? manifest.license : manifest.license?.type;
    if (!value) throw new Error(`${manifest.name}@${manifest.version} does not declare a license.`);
    return value;
}

function readRepository(manifest) {
    const value = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    if (!value) return 'Not declared';
    return value.replace(/^git\+/, '').replace(/\.git$/, '');
}

async function readLicenseText(packageDir, key) {
    const entries = await readdir(packageDir);
    const filename = entries
        .filter((name) => /^(licen[cs]e|copying)(\.|$)/i.test(name))
        .sort((a, b) => a.localeCompare(b))[0];
    if (!filename) throw new Error(`${key} does not include a license file.`);
    return (await readFile(path.join(packageDir, filename), 'utf8')).trim();
}

function render(entries) {
    const index = entries
        .map((entry) => `${entry.key}\t${entry.license}\t${entry.source}`)
        .join('\n');
    const notices = entries
        .map(
            (entry) =>
                `================================================================================\n` +
                `${entry.key}\n` +
                `SPDX-License-Identifier: ${entry.license}\n` +
                `Source: ${entry.source}\n` +
                `================================================================================\n\n` +
                `${entry.licenseText}\n`,
        )
        .join('\n');

    return (
        'THIRD-PARTY SOFTWARE LICENSES\n\n' +
        'This file covers production dependencies bundled into lavender-mcp-server release artifacts.\n' +
        'License identifiers are SPDX expressions taken from the installed package metadata.\n\n' +
        'PACKAGE INDEX\n\n' +
        `${index}\n\n` +
        'LICENSE TEXTS\n\n' +
        notices
    );
}
