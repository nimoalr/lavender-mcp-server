# lavender-mcp-server

An MCP server packaged as a resource for local FiveM and RedM development. It allows an MCP client to inspect the server, manage resources, read console output, and execute JavaScript or Lua in server or connected-client runtimes.

## Security warning

This resource provides arbitrary code execution in the server process and connected game clients. It can also expose player identifiers, endpoints, and tokens to an authenticated MCP client.

Use it only on a trusted development machine. Do not install it on a public or production server, expose its port to a network, or port-forward it.

The HTTP listener is restricted to `127.0.0.1`, validates `Host` and `Origin` headers, and requires a Bearer token. These controls reduce accidental local exposure; they do not make remote deployment safe.

## Requirements

- Server artifact 25943 or newer
- An MCP client with Streamable HTTP support

The resource declares `node_version '22'` and ships self-contained JavaScript bundles. No package installation or build step runs on the server.

## Installation

1. Download the current `lavender-mcp-server-<version>.zip` from [GitHub Releases](https://github.com/nimoalr/lavender-mcp-server/releases/latest).
2. Extract the `lavender-mcp-server` directory into the server's `resources` directory.
3. Generate a random token on the development machine:

   ```bash
   openssl rand -hex 32
   ```

   Windows PowerShell without OpenSSL:

   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [Convert]::ToBase64String($bytes)
   ```

4. Add the resource configuration to `server.cfg`:

   ```cfg
   # Use `set`. `sets` publishes the value and `setr` replicates it to clients.
   set lavender_mcp_token "PASTE_THE_GENERATED_TOKEN_HERE"

   # Required by the built-in restart and refresh tools.
   add_ace resource.lavender-mcp-server command.restart allow
   add_ace resource.lavender-mcp-server command.refresh allow

   ensure lavender-mcp-server
   ```

   To allow `execute_command` to run any console command, grant the broader development-only ACE instead of the two command-specific entries:

   ```cfg
   add_ace resource.lavender-mcp-server command allow
   ```

5. Start the server. The resource prints its local MCP URL after the listener binds.

The resource refuses to start the HTTP listener when the token is missing, shorter than 32 characters, or matches a documented placeholder.

### Custom port

The default port is `3414`. Override it before starting the resource:

```cfg
set lavender_mcp_port 4000
```

The listener remains bound to `127.0.0.1`.

## MCP client configuration

Connect to:

```text
http://127.0.0.1:3414/mcp
```

Every request requires:

```http
Authorization: Bearer <lavender_mcp_token>
```

The endpoint supports MCP `2026-07-28` and stateless compatibility with 2025-era Streamable HTTP clients.

### Claude Code

```bash
export LAVENDER_MCP_TOKEN="<same value as server.cfg>"

claude mcp add --transport http --scope user \
  --header "Authorization: Bearer $LAVENDER_MCP_TOKEN" \
  lavender_mcp http://127.0.0.1:3414/mcp
```

For `.mcp.json`, Claude Code supports environment-variable expansion:

```json
{
  "mcpServers": {
    "lavender_mcp": {
      "type": "http",
      "url": "http://127.0.0.1:3414/mcp",
      "headers": {
        "Authorization": "Bearer ${LAVENDER_MCP_TOKEN}"
      }
    }
  }
}
```

### OpenAI Codex

Set `LAVENDER_MCP_TOKEN` in the environment, then add this to `~/.codex/config.toml`:

```toml
[mcp_servers.lavender_mcp]
url = "http://127.0.0.1:3414/mcp"
bearer_token_env_var = "LAVENDER_MCP_TOKEN"
```

For other clients, use their Streamable HTTP configuration and set the same Authorization header.

## Tools

| Tool | Purpose | Required ACE |
|---|---|---|
| `get_server_info` | Return server, game, runtime, uptime, and player-count information | None |
| `list_clients` | List connected players and identifiers | None |
| `get_client_info` | Return details for one server ID | None |
| `execute_code` | Execute code on the server or selected clients; `language` is `javascript` (default) or `lua` | None |
| `get_console_logs` | Read recent server-console entries | None |
| `list_resources` | List resources and their states | None |
| `start_resource` | Start a resource through the native API | None |
| `stop_resource` | Stop a resource through the native API | None |
| `restart_resource` | Restart a resource | `command.restart` |
| `refresh_resources` | Rescan the resources directory | `command.refresh` |
| `execute_command` | Execute a server-console command | `command.<name>` |
| `get_convar` | Read a convar | None |
| `set_convar` | Set a convar | None |

Resource lifecycle tools refuse to act on `lavender-mcp-server` itself.

Server resources can also register custom namespaced MCP tools. See [EXTENDING.md](./EXTENDING.md) for the export API.

Both languages execute inside Lavender's own runtime on the server or selected clients; they cannot access another resource's private variables. Use that resource's exports or a custom MCP tool when private state is required. Lua chunks execute synchronously, although they may create background threads.

## Client logs

The server exposes console output to its scripting runtime, but does not provide equivalent access to client logs. This MCP server includes instructions that tell a local coding agent where to find FiveM and RedM client logs on the developer's machine.

## Health check

`GET /mcp/health` does not require authentication. It returns the resource name and version, process uptime, console-buffer size, and a timestamp. It does not expose tool results.

```bash
curl http://127.0.0.1:3414/mcp/health
```

## Development

Release archives contain the compiled bundles. The repository contains their TypeScript sources and builds them in CI.

```bash
git clone https://github.com/nimoalr/lavender-mcp-server.git
cd lavender-mcp-server
npm ci
npm run verify
npm run package
```

Useful commands:

```bash
npm run build       # build dist/server.js and dist/client.js
npm run watch       # rebuild after source changes
npm run typecheck   # check TypeScript
npm test            # run the test suite
npm run licenses    # regenerate third-party license notices
```

`npm run package` prepares the release resource under `.release/lavender-mcp-server`.

After CI succeeds on `main`, the release workflow reads the version from `package.json`. If that version has not been released, it creates the matching `v<version>` tag and publishes the packaged resource. Keep the versions in `package.json`, `package-lock.json`, and `fxmanifest.lua` aligned when preparing a release.

## License

lavender-mcp-server is licensed under the [MIT License](./LICENSE). Bundled dependency notices are in [THIRD_PARTY_LICENSES.txt](./THIRD_PARTY_LICENSES.txt), and each GitHub release includes an SPDX JSON SBOM.
