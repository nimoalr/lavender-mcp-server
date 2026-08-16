# Contributing

## Development setup

```bash
npm ci
npm run verify
```

`npm run verify` type-checks the source, runs the tests, builds both runtime bundles, and verifies the generated third-party notices.

Use `npm run watch` while developing. Restart `lavender-mcp-server` in the server console after server-bundle changes; reconnect game clients after client-bundle changes.

## Pull requests

- Keep the MCP tool surface focused on local server development.
- Add tests for protocol, security, RPC, or schema behavior changes.
- Run `npm run licenses` after changing production dependencies.
- Do not commit `dist/` or `.release/`; CI builds release artifacts.
- Update `README.md` or `EXTENDING.md` when public behavior changes.

## Releases

Set the same version in `package.json` and `fxmanifest.lua`, commit the change, and create a signed or annotated `v<version>` tag. The release workflow validates the version, builds the resource, generates checksums and an SPDX JSON SBOM, and publishes the assets to GitHub Releases.
