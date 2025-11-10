import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage<{ contexts: string[] }>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, '../store/logs/');
const logPath = path.join(logDir, '/metadatarr.log')
const maxSize = 10 * 1024 * 1024;

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
if (fs.existsSync(logPath) && fs.statSync(logPath).size > maxSize) fs.renameSync(logPath, `${logPath}.bak`);

const logFile = fs.createWriteStream(logPath, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (...args): void => {
  logFile.write(`[LOG] ${  args.join(' ')  }\n`);
  logContext('log', () => { originalConsoleLog(...args); });
};

console.warn = (...args): void => {
  logFile.write(`[WARN] ${  args.join(' ')  }\n`);
  logContext('warn', () => { originalConsoleWarn(...args); });
};

console.error = (...args): void => {
  logFile.write(`[ERROR] ${  args.join(' ')  }\n`);
  logContext('error', () => { originalConsoleError(...args); });
};

const green = (text: string): string=> `\x1b[32m${text}\x1b[0m`;

export const logContext = <T>(context: string, callback: () => T): T => {
  const store = asyncLocalStorage.getStore();
  const contexts = store ? [...store.contexts, context] : [context];
  return asyncLocalStorage.run({ contexts }, callback);
};

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
const proxyConsole = function(origConsole: (...args: unknown[]) => void, ...args: unknown[]): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    const prefixes = store.contexts.map(ctx => green(`[${ctx.toUpperCase()}]`));
    origConsole(...prefixes, ...args);
  } else origConsole(...args);
};
console.log = (...args): void => { proxyConsole(originalLog, ...args) };
console.warn = (...args): void => { proxyConsole(originalWarn, ...args) };
console.error = (...args): void => { proxyConsole(originalError, ...args) };