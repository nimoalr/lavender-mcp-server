# Security policy

## Supported use

lavender-mcp-server is supported only on trusted local development systems. Network-exposed, public, shared, and production deployments are outside the security model.

The resource intentionally provides arbitrary code execution in the server process and connected game clients. Possession of the configured Bearer token grants that capability.

## Reporting a vulnerability

Report vulnerabilities through the repository's [private vulnerability reporting form](https://github.com/nimoalr/lavender-mcp-server/security/advisories/new). Do not include credentials, player identifiers, or server configuration in a public issue.

Include the affected version, operating system, server artifact, reproduction steps, and expected impact. Security reports are assessed against the supported local-development deployment described above.
