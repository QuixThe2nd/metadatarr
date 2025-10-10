import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logPath = path.join(__dirname, '../store/logs/metadatarr.log');
const maxSize = 10 * 1024 * 1024;

function checkLogSize() {
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    if (stats.size > maxSize) fs.renameSync(logPath, logPath + '.bak');
  }
}

checkLogSize();
const logFile = fs.createWriteStream(logPath, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
  logFile.write('[LOG] ' + args.join(' ') + '\n');
  logContext('log', () => originalConsoleLog(...args));
};

console.warn = function(...args) {
  logFile.write('[WARN] ' + args.join(' ') + '\n');
  logContext('warn', () => originalConsoleWarn(...args));
};

console.error = function(...args) {
  logFile.write('[ERROR] ' + args.join(' ') + '\n');
  logContext('error', () => originalConsoleError(...args));
};

const blue = (text: string) => `\x1b[32m${text}\x1b[0m`;

export const logContext = <T>(context: string, callback: () => T): T => {
  console.log = (...args) => originalConsoleLog.apply(console, [blue(`[${context.toUpperCase()}]`), ...args]);
  console.warn = (...args) => originalConsoleWarn.apply(console, [blue(`[${context.toUpperCase()}]`), ...args]);
  console.error = (...args) => originalConsoleError.apply(console, [blue(`[${context.toUpperCase()}]`), ...args]);
  const result = callback();
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  return result;
}
