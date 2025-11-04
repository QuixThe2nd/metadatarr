import fs from 'fs';
import JSONC from 'jsonc-parser';
import z from "zod";
import * as schemas from "./schemas";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configDir = path.join(__dirname, '../store/config');

if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

function parseConfigFile<T extends z.ZodObject | z.ZodRecord>(filePath: string, schema: T): z.infer<T> {
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const partial = schema instanceof z.ZodObject ? schema.partial() : schema;

  const configPath = path.join(configDir, `/${filePath}`);

  const rawDefaultConfig = fs.readFileSync(path.join(__dirname, `../config_template/${filePath}`), 'utf8');
  const defaultConfig = strict.parse(JSONC.parse(rawDefaultConfig)) as z.infer<T>;
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, rawDefaultConfig);
  const config = partial.parse(JSONC.parse(fs.readFileSync(configPath, 'utf8')) ?? {}) as Partial<z.infer<T>>;
  for (const key in config) 
    if (config[key] !== undefined) defaultConfig[key] = config[key];
  
  return defaultConfig;
}

export const CONFIG = {
  CLIENT: (): z.infer<typeof schemas.ClientSchema> => parseConfigFile('.client.jsonc', schemas.ClientSchema),
  METADATA: (): z.infer<typeof schemas.MetadataSchema> => parseConfigFile('metadata.jsonc', schemas.MetadataSchema),
  SORT: (): z.infer<typeof schemas.SortConfigSchema> => parseConfigFile('sort.jsonc', schemas.SortConfigSchema),
  NAMING: (): z.infer<typeof schemas.NamingConfigSchema> => parseConfigFile('naming.jsonc', schemas.NamingConfigSchema),
  QUEUE: (): z.infer<typeof schemas.QueueSchema> => parseConfigFile('queue.jsonc', schemas.QueueSchema),
  CORE: (): z.infer<typeof schemas.CoreSchema> => parseConfigFile('core.jsonc', schemas.CoreSchema),
  ACTIONS: (): z.infer<typeof schemas.ActionsSchema> => parseConfigFile('actions.jsonc', schemas.ActionsSchema),
  UNCROSS_SEED: (): z.infer<typeof schemas.UncrossSeedSchema> => parseConfigFile('uncross-seed.jsonc', schemas.UncrossSeedSchema)
};

const yellow = (text: string): string => `\x1b[33m${text}\x1b[0m`;
const green_highlight = (text: string): string => `\x1b[42m\x1b[30m${text}\x1b[0m`;
const red_highlight = (text: string): string => `\x1b[41m\x1b[37m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

export const testConfig = async (): Promise<void> => {
  for (const [config, parse] of Object.entries(CONFIG)) {
    console.log(`Validating config: ${config}`)
    parse();
  }

  console.warn(yellow('|==================================|'));
  console.warn(yellow('||                                ||'));
  if (CONFIG.CORE().DRY_RUN) {
    console.warn(yellow('||       Dry Run is Enabled       ||'));
    console.warn(yellow('||       CHANGES ') + green_highlight(bold('WONT')) + yellow(' SAVE        ||'));
  } else {
    console.warn(yellow('||       Dry Run is Disabled      ||'));
    console.warn(yellow('||       CHANGES ') + red_highlight(bold('WILL')) + yellow(' SAVE        ||'));
  }
  console.warn(yellow('||                                ||'));
  console.warn(yellow('|==================================|'));
  if (!CONFIG.CORE().DRY_RUN) await new Promise(res => setTimeout(res, 5_000))
}
