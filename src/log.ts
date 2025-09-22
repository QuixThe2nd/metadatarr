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
  originalConsoleLog.apply(console, ['[LOG]', ...args]);
};

console.warn = function(...args) {
  logFile.write('[WARN] ' + args.join(' ') + '\n');
  originalConsoleWarn.apply(console, ['[WARN]', ...args]);
};

console.error = function(...args) {
  logFile.write('[ERROR] ' + args.join(' ') + '\n');
  originalConsoleError.apply(console, ['[ERROR]', ...args]);
};