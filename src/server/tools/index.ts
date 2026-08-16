import { registerGetServerInfo } from './serverInfo';
import { registerListClients } from './listClients';
import { registerGetClientInfo } from './getClientInfo';
import { registerExecuteCode } from './executeCode';
import { registerGetConsoleLogs } from './getConsoleLogs';
import { registerResourceTools } from './resources';
import { registerCommandTools } from './commands';

export function registerBuiltInTools(): void {
    registerGetServerInfo();
    registerListClients();
    registerGetClientInfo();
    registerExecuteCode();
    registerGetConsoleLogs();
    registerResourceTools();
    registerCommandTools();
}
