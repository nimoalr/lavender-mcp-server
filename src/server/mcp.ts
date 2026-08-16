import { McpServer } from '@modelcontextprotocol/server';
import { applyToolsTo } from './registry';
import { VERSION } from './version';

export const MCP_INSTRUCTIONS = [
    'Use get_console_logs for the server console.',
    'Client logs are local files and are not readable through this MCP server.',
    'When the agent and game client share a Windows machine, inspect the newest matching files by LastWriteTime:',
    String.raw`- FiveM Legacy: %LOCALAPPDATA%\FiveM\FiveM.app\logs\CitizenFX_log_*.log`,
    String.raw`- RedM: %LOCALAPPDATA%\RedM\RedM.app\logs\CitizenFX_log_*.log`,
    String.raw`- FiveM for GTAV Enhanced: %APPDATA%\FiveM for GTAV Enhanced\logs`,
    'For Enhanced, fivem-for-gtav-enhanced*.log* contains game/runtime output, cef*.log contains CEF/browser output, and fivem-launcher*.log contains launcher output.',
    'Enhanced filenames containing -cl2 belong to a secondary local client when two clients are running on the same machine.',
].join('\n');

export function createMcpServer(): McpServer {
    const server = new McpServer(
        {
            name: 'lavender-mcp-server',
            version: VERSION,
        },
        {
            capabilities: {
                tools: {},
            },
            instructions: MCP_INSTRUCTIONS,
        },
    );
    applyToolsTo(server);
    return server;
}
