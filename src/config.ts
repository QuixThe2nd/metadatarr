import fs from 'fs';
import JSONC from 'jsonc-parser';
import { z } from 'zod';

const QbittorrentClientSchema = z.object({
  ENDPOINT: z.url(),
  USERNAME: z.string().min(1),
  PASSWORD: z.string().min(1)
});

const MetadataSchema = z.object({
  TORRENT_PATH: z.string().min(1),
  sources: z.array(z.object({
    url: z.tuple([z.string().url(), z.union([z.string(), z.void()])])
  }))
});

const BaseSortMethodSchema = z.object({ direction: z.enum(["ASC", "DESC"]) });

const SortMethodsSchema = z.union([
  BaseSortMethodSchema.extend({ key: z.enum(["SIZE", "COMPLETED", "PRIVATE", "PROGRESS", "NO_METADATA", "REMAINING"]) }),
  BaseSortMethodSchema.extend({ key: z.literal("NAME_CONTAINS"), searchString: z.string().min(1) }),
  BaseSortMethodSchema.extend({ key: z.literal("TAGS"), tags: z.array(z.string().min(1)).min(1) }),
  BaseSortMethodSchema.extend({ key: z.literal("CATEGORIES"), categories: z.array(z.string().min(1)).min(1) }),
  BaseSortMethodSchema.extend({ key: z.literal("PRIORITY_TAG"), prefix: z.string().min(1) }),
  BaseSortMethodSchema.extend({ key: z.literal("PROGRESS_THRESHOLD"), threshold: z.number().min(0).max(1) })
]);

const SortConfigSchema = z.object({
  SORT: z.literal(true),
  MOVE_DELAY: z.number().int().nonnegative(),
  RESORT_STEP: z.number().int().nonnegative(),
  RESORT_STEP_MINIMUM_CALLS: z.number().int().nonnegative(),
  RESORT_STEP_CALLS: z.number().int().nonnegative(),
  METHODS: z.array(SortMethodsSchema),
  CHECKING_METHODS: z.array(SortMethodsSchema),
  MOVING_METHODS: z.array(SortMethodsSchema),
  MOVE_STOPPED: z.number().min(-1).max(1),
  PREFER_CHECKING_DOWNLOADS: z.number().min(-1).max(1),
  PERSISTENT_MOVES: z.boolean()
});

const DuplicatesSchema = z.object({
  DOWNLOADS_ONLY: z.boolean(),
  TIE_BREAKERS: z.array(SortMethodsSchema),
  IGNORE_TAG: z.string(),
  PREFER_UPLOADING: z.boolean()
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

export type NamingConfig = z.infer<typeof NamingConfigSchema>

const TorrentsSchema = z.object({
  RESUME_COMPLETED: z.boolean(),
  RECHECK_MISSING: z.boolean(),
  RESUME_ALMOST_FINISHED_THRESHOLD: z.number(),
  FORCE_SEQUENTIAL_DOWNLOAD: z.number().min(-1).max(1)
});

const QueueSchema = z.object({
  QUEUE_SIZE_LIMIT: z.number(),
  HARD_QUEUE_SIZE_LIMIT: z.boolean(),
  INCLUDE_MOVING_TORRENTS: z.boolean(),
  EXCLUDE_CATEGORIES: z.array(z.string()),
  MINIMUM_QUEUE_SIZE: z.number(),
  MAXIMUM_QUEUE_SIZE: z.number()
});

const CoreSchema = z.object({
  DEV: z.boolean(),
  JOB_WAIT: z.number(),
  DEV_INJECT: z.boolean(),
  DRY_RUN: z.boolean()
});

const RemoveSchema = z.object({
  CATEGORY: z.string(),
  PROGRESS: z.number().min(0).max(1)
});

export type Source = z.infer<typeof MetadataSchema>['sources'];
export type SortMethods = z.infer<typeof SortMethodsSchema>;

function parseConfigFile<T extends z.ZodObject<any>>(filePath: string, schema: T): z.infer<T> {
  const defaultConfig = schema.strict().parse(JSONC.parse(fs.readFileSync(`./config_template/${filePath}`, 'utf8'))) as z.infer<T>;
  const config = (fs.existsSync(`./store/config/${filePath}`) ? schema.partial().parse(JSONC.parse(fs.readFileSync(`./store/config/${filePath}`, 'utf8')) ?? {}) : {}) as Partial<z.infer<T>>;
  for (const key in config) {
    if (config[key] !== undefined) defaultConfig[key] = config[key];
  }
  return defaultConfig;
}

export const CONFIG = {
  CLIENT: () => parseConfigFile('.qbittorrent_client.jsonc', QbittorrentClientSchema),
  METADATA: () => parseConfigFile('metadata.jsonc', MetadataSchema),
  TORRENTS: () => parseConfigFile('torrents.jsonc', TorrentsSchema),
  SORT: () => parseConfigFile('sort.jsonc', SortConfigSchema),
  NAMING: () => parseConfigFile('naming.jsonc', NamingConfigSchema),
  DUPLICATES: () => parseConfigFile('duplicates.jsonc', DuplicatesSchema),
  QUEUE: () => parseConfigFile('queue.jsonc', QueueSchema),
  CORE: () => parseConfigFile('core.jsonc', CoreSchema),
  REMOVE: () => parseConfigFile('remove.jsonc', RemoveSchema),
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
