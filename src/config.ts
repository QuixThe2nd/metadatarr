import fs from 'fs';
import JSONC from 'jsonc-parser';
import z from "zod";
import * as schemas from "./schemas";

function parseConfigFile<T extends z.ZodObject | z.ZodArray>(filePath: string, schema: T): z.infer<T> {
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const partial = schema instanceof z.ZodObject ? schema.partial() : schema;

  const defaultConfig = strict.parse(JSONC.parse(fs.readFileSync(`./config_template/${filePath}`, 'utf8'))) as z.infer<T>;
  const config = (fs.existsSync(`./store/config/${filePath}`) ? partial.parse(JSONC.parse(fs.readFileSync(`./store/config/${filePath}`, 'utf8')) ?? {}) : {}) as Partial<z.infer<T>>;
  for (const key in config) 
    if (config[key] !== undefined) defaultConfig[key] = config[key];
  
  return defaultConfig;
}

export const CONFIG = {
  CLIENT: (): z.infer<typeof schemas.QbittorrentClientSchema> => parseConfigFile('.qbittorrent_client.jsonc', schemas.QbittorrentClientSchema),
  METADATA: (): z.infer<typeof schemas.MetadataSchema> => parseConfigFile('metadata.jsonc', schemas.MetadataSchema),
  SORT: (): z.infer<typeof schemas.SortConfigSchema> => parseConfigFile('sort.jsonc', schemas.SortConfigSchema),
  NAMING: (): z.infer<typeof schemas.NamingConfigSchema> => parseConfigFile('naming.jsonc', schemas.NamingConfigSchema),
  DUPLICATES: (): z.infer<typeof schemas.DuplicatesSchema> => parseConfigFile('duplicates.jsonc', schemas.DuplicatesSchema),
  QUEUE: (): z.infer<typeof schemas.QueueSchema> => parseConfigFile('queue.jsonc', schemas.QueueSchema),
  CORE: (): z.infer<typeof schemas.CoreSchema> => parseConfigFile('core.jsonc', schemas.CoreSchema),
  ACTIONS: (): z.infer<typeof schemas.ActionsSchema> => parseConfigFile('actions.jsonc', schemas.ActionsSchema),
};

const yellow = (text: string): string => `\x1b[33m${text}\x1b[0m`;
const green_highlight = (text: string): string => `\x1b[42m\x1b[30m${text}\x1b[0m`;
const red_highlight = (text: string): string => `\x1b[41m\x1b[37m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

export const testConfig = async (): Promise<void> => {
  for (const config of Object.values(CONFIG)) config();

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
