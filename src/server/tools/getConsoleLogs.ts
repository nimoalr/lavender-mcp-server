import { z } from 'zod';
import { BUILTIN_RESOURCE, registerTool } from '../registry';
import { bufferSize, getEntries, maxBufferSize, type LogLevel } from '../util/consoleCapture';

export function registerGetConsoleLogs(): void {
    registerTool({
        name: 'get_console_logs',
        config: {
            description:
                'Return recent server-console entries. Client logs are local files: read the newest %LOCALAPPDATA%\\FiveM\\FiveM.app\\logs\\CitizenFX_log_*.log for FiveM Legacy, %LOCALAPPDATA%\\RedM\\RedM.app\\logs\\CitizenFX_log_*.log for RedM, or game/runtime fivem-for-gtav-enhanced*.log* under %APPDATA%\\FiveM for GTAV Enhanced\\logs. Enhanced CEF and launcher output use cef*.log and fivem-launcher*.log; -cl2 filenames belong to a secondary local client.',
            inputSchema: z.object({
                lines: z
                    .number()
                    .min(1)
                    .max(maxBufferSize)
                    .optional()
                    .describe(`Number of most recent entries per source (default 50, max ${maxBufferSize}).`),
                level: z
                    .enum(['log', 'error', 'warn', 'info', 'debug'])
                    .optional()
                    .describe('Optional filter by log level.'),
                channel: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        'Optional case-insensitive substring filter for the console channel, e.g. "script:renegade" or "cmd".',
                    ),
            }),
        },
        handler: ({ lines, level, channel }) => {
            const n = Math.min(Math.max(lines ?? 50, 1), maxBufferSize);
            return formatServer(n, level, channel);
        },
        registeredBy: BUILTIN_RESOURCE,
    });
}

function formatServer(n: number, level: LogLevel | undefined, channel: string | undefined) {
    const entries = getEntries(n, level, channel).map((e) => ({
        time: new Date(e.ts).toISOString(),
        channel: e.channel,
        level: e.level,
        message: e.message,
    }));
    return {
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(
                    {
                        source: 'server',
                        bufferSize: bufferSize(),
                        maxBufferSize,
                        channelFilter: channel,
                        returned: entries.length,
                        entries,
                    },
                    null,
                    2,
                ),
            },
        ],
    };
}
