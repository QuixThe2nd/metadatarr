import fs from 'fs';
import JSONC from 'jsonc-parser';
import z from "zod";
import * as schemas from "./schemas";
import path from 'path';
import { fileURLToPath } from 'url';
import { logContext } from './log';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(__dirname, '../store/config/');

if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

export function parseConfigFile<T extends z.ZodObject | z.ZodRecord>(filePath: string, schema: T): z.infer<T> {
  const partial = schema instanceof z.ZodObject ? schema.partial() : schema;

  const configPath = path.join(configDir, `/${filePath}`);

  const defaultConfig = schema.parse({}) as z.infer<T>;
  if (!fs.existsSync(configPath)) {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig)); // TODO: Add zod's .describe as comments
  }
  const config = (fs.existsSync(configPath) ? partial.parse(JSONC.parse(fs.readFileSync(configPath, 'utf8'))) : {}) as Partial<z.infer<T>>;
  for (const key in config) 
    if (config[key] !== undefined) defaultConfig[key] = config[key];

  return defaultConfig;
}

export const CONFIG = {
  CLIENT: (): z.infer<typeof schemas.ClientSchema> => parseConfigFile('.client.jsonc', schemas.ClientSchema),
  CORE: (): z.infer<typeof schemas.CoreSchema> => parseConfigFile('core.jsonc', schemas.CoreSchema),
};

const yellow = (text: string): string => `\x1b[33m${text}\x1b[0m`;
const green_highlight = (text: string): string => `\x1b[42m\x1b[30m${text}\x1b[0m`;
const red_highlight = (text: string): string => `\x1b[41m\x1b[37m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

export const testConfig = (): Promise<void> => logContext('startup', async () => {
  for (const [config, parse] of Object.entries(CONFIG)) {
    console.log(`Validating config: ${config}`)
    parse();
  }

  console.warn(yellow('|==================================|'));
  console.warn(yellow('||                                ||'));
  if (CONFIG.CORE().DRY_RUN) {
    console.warn(yellow('||       Dry Run is Enabled       ||'));
    console.warn(yellow('||       CHANGES ') + green_highlight(bold("WON'T")) + yellow(' SAVE       ||'));
  } else {
    console.warn(yellow('||       Dry Run is Disabled      ||'));
    console.warn(yellow('||       CHANGES ') + red_highlight(bold('WILL')) + yellow(' SAVE        ||'));
  }
  console.warn(yellow('||                                ||'));
  console.warn(yellow('|==================================|'));
  if (!CONFIG.CORE().DRY_RUN) await new Promise(res => setTimeout(res, 5_000))
});
