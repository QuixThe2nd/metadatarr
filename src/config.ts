import fs from 'fs';
import JSONC from 'jsonc-parser';
import { z } from 'zod';
import { SelectorSchema } from './classes/SelectorEngine';
import Qbittorrent from './classes/qBittorrent';
import Torrent from './classes/Torrent';

const CoreSchema = z.object({
  JOB_WAIT: z.number(),
  NO_JOB_WAIT: z.number(),
  DEV_INJECT: z.boolean(),
  DRY_RUN: z.boolean()
});

const QbittorrentClientSchema = z.object({
  ENDPOINT: z.url(),
  USERNAME: z.string().min(1),
  PASSWORD: z.string().min(1)
});

const NamingConfigSchema = z.object({
  SCHEME: z.string(),
  REPLACE: z.array(z.tuple([z.string(), z.string()])),
  FIX_BAD_GROUPS: z.array(z.string()),
  TAG_FAILED_PARSING: z.boolean(),
  TAG_SUCCESSFUL_PARSING: z.boolean(),
  RENAME_FILES: z.boolean(),
  TRIM_CONTAINER: z.boolean(),
  SKIP_IF_UNKNOWN: z.boolean(),
  REMOVE_DOMAINS: z.boolean(),
  NO_YEAR_IN_SEASONS: z.boolean(),
  REMOVE_TLDS: z.array(z.string()),
  RECHECK_ON_RENAME: z.boolean(),
  FORCE_SAME_DIRECTORY_NAME: z.boolean(),
  SPACING: z.string().length(1),
  TORRENTS_DIR: z.string(),
  FORCE_TITLE_CASE: z.boolean(),
  FORCE_ORIGINAL_NAME: z.boolean(),
  TAG_MISSING_ORIGINAL_NAME: z.boolean(),
  RESET_ON_FAIL: z.boolean()
});

export type NamingConfig = z.infer<typeof NamingConfigSchema>;

const SortConfigSchema = z.object({
  SORT: z.literal(true),
  MOVE_DELAY: z.number().int().nonnegative(),
  RESORT_STEP: z.number().int().nonnegative(),
  RESORT_STEP_MINIMUM_CALLS: z.number().int().nonnegative(),
  RESORT_STEP_CALLS: z.number().int().nonnegative(),
  PERSISTENT_MOVES: z.boolean(),
  METHODS: z.array(SelectorSchema),
  CHECKING_METHODS: z.array(SelectorSchema),
  MOVING_METHODS: z.array(SelectorSchema)
});

type MethodNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

function getMethodNames<T extends object>(obj: T): MethodNames<T>[] {
  const methods = new Set<string>();
  for (let proto = obj; proto; proto = Object.getPrototypeOf(proto)) {
    Object.getOwnPropertyNames(proto).forEach(prop => typeof (obj as any)[prop] === 'function' && prop !== 'constructor' && methods.add(prop));
  }
  return [...methods] as MethodNames<T>[];
}
const exclude = <T, E extends T>(arr: T[], excluded: readonly E[]): Exclude<T, E>[] => arr.filter(item => !(excluded as readonly T[]).includes(item)) as Exclude<T, E>[];

const actions = getMethodNames(new Torrent({} as Qbittorrent, {} as Torrent));
const excludedActions = ['rename', 'renameFile', 'setCategory', 'removeTags', 'addTags', 'setAutoManagement', 'files'] as const;
const filteredActions = exclude(actions, excludedActions);

const ActionsSchema = z.array(z.object({ if: z.array(SelectorSchema) }).and(z.union([
  z.object({ then: z.literal('setAutoManagement'), arg: z.boolean() }),
  z.object({ then: z.enum(filteredActions) })
])));

const QueueSchema = z.object({
  QUEUE_SIZE_LIMIT: z.number(),
  HARD_QUEUE_SIZE_LIMIT: z.boolean(),
  INCLUDE_MOVING_TORRENTS: z.boolean(),
  EXCLUDE_CATEGORIES: z.array(z.string()),
  MINIMUM_QUEUE_SIZE: z.number(),
  MAXIMUM_QUEUE_SIZE: z.number()
});

const DuplicatesSchema = z.object({
  DOWNLOADS_ONLY: z.boolean(),
  TIE_BREAKERS: z.array(SelectorSchema),
  IGNORE_TAG: z.string(),
  PREFER_UPLOADING: z.boolean()
});

const MetadataSchema = z.object({
  TORRENT_PATH: z.string().min(1),
  sources: z.array(z.object({
    url: z.tuple([z.string().url(), z.union([z.string(), z.void()])])
  }))
});

export type Source = z.infer<typeof MetadataSchema>['sources'];

function parseConfigFile<T extends z.ZodObject<any> | z.ZodArray<any>>(filePath: string, schema: T): z.infer<T> {
  const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
  const partial = schema instanceof z.ZodObject ? schema.partial() : schema;

  const defaultConfig = strict.parse(JSONC.parse(fs.readFileSync(`./config_template/${filePath}`, 'utf8'))) as z.infer<T>;
  const config = (fs.existsSync(`./store/config/${filePath}`) ? partial.parse(JSONC.parse(fs.readFileSync(`./store/config/${filePath}`, 'utf8')) ?? {}) : {}) as Partial<z.infer<T>>;
  for (const key in config) {
    if (config[key] !== undefined) defaultConfig[key] = config[key];
  }
  return defaultConfig;
}

export const CONFIG = {
  CLIENT: () => parseConfigFile('.qbittorrent_client.jsonc', QbittorrentClientSchema),
  METADATA: () => parseConfigFile('metadata.jsonc', MetadataSchema),
  SORT: () => parseConfigFile('sort.jsonc', SortConfigSchema),
  NAMING: () => parseConfigFile('naming.jsonc', NamingConfigSchema),
  DUPLICATES: () => parseConfigFile('duplicates.jsonc', DuplicatesSchema),
  QUEUE: () => parseConfigFile('queue.jsonc', QueueSchema),
  CORE: () => parseConfigFile('core.jsonc', CoreSchema),
  ACTIONS: () => parseConfigFile('actions.jsonc', ActionsSchema),
};

const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green_highlight = (text: string) => `\x1b[42m\x1b[30m${text}\x1b[0m`;
const red_highlight = (text: string) => `\x1b[41m\x1b[37m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

export const testConfig = async () => {
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
  
  await new Promise(res => setTimeout(res, 5_000))
}
