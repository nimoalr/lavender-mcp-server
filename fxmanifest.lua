fx_version 'cerulean'
game 'common'

name 'lavender-mcp-server'
author 'Nimoa'
description 'Development-only MCP server resource for FiveM and RedM.'
version '0.1.0'
repository 'https://github.com/nimoalr/lavender-mcp-server'

node_version '22'

server_scripts {
    'dist/server.js'
}

client_scripts {
    'dist/client.js'
}

files {
    'dist/server.js',
    'dist/client.js',
}

convar_category 'Lavender MCP' {
    'Configuration',
    {
        { 'MCP port (localhost only)', 'lavender_mcp_port', 'CV_INT', '3414' },
        { 'MCP auth token (REQUIRED — must be set to a non-default value)', 'lavender_mcp_token', 'CV_STRING', '' },
    }
}
