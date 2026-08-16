import { getListeningPort, isListening, startHttpServer, stopHttpServer } from './http';
import { initRpc } from './rpc';
import { registerExports } from './exports';
import { registerBuiltInTools } from './tools';
import { initConsoleCapture } from './util/consoleCapture';

setImmediate(async () => {
    initConsoleCapture();
    try {
        registerBuiltInTools();
        registerExports();
        initRpc();
        await startHttpServer();
    } catch (err) {
        console.error('^1[lavender-mcp]^7 failed to start:', err);
    }
});

on('onResourceStop', async (resourceName: string) => {
    if (resourceName !== GetCurrentResourceName()) return;
    try {
        await stopHttpServer();
    } catch (err) {
        console.error('^1[lavender-mcp]^7 error during stop:', err);
    }
});

RegisterCommand(
    'lavender_mcp_status',
    () => {
        console.log(
            `^5[lavender-mcp]^7 listening=${isListening()} port=${getListeningPort() ?? 'none'} players=${GetNumPlayerIndices()}`,
        );
    },
    true,
);
