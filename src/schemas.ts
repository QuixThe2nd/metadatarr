import { z } from 'zod';
import { SelectorSchema } from './classes/SelectorEngine';
import Torrent from './classes/Torrent';
import { stringKeys } from './jobs/Naming';
import type Client from './clients/client';

type MethodNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T];

function getMethodNames<T extends object>(obj: T): MethodNames<T>[] {
  const methods = new Set<string>();
  for (let proto: T | null = obj; proto; proto = Object.getPrototypeOf(proto) as T | null) 
  Object.getOwnPropertyNames(proto).forEach(prop => typeof obj[prop] === 'function' && prop !== 'constructor' && methods.add(prop));
  
  return [...methods] as MethodNames<T>[];
}
const exclude = <T, E extends T>(arr: T[], excluded: readonly E[]): Exclude<T, E>[] => arr.filter(item => !(excluded as readonly T[]).includes(item)) as Exclude<T, E>[];

const actions = getMethodNames(new Torrent({} as Client, {} as Torrent));
const excludedActions = ['setAutoManagement', 'addTags', 'removeTags', 'rename', 'renameFile', 'setCategory', 'files'] as const;
const filteredActions = exclude(actions, excludedActions);

export const ActionsSchema = z.object({
  ACTIONS: z.array(z.object({ if: z.array(SelectorSchema) }).and(z.union([
    z.object({ then: z.enum(['setAutoManagement', 'addTags', 'removeTags']), arg: z.union([z.boolean(), z.string()]) }),
    z.object({ then: z.enum(filteredActions) })
  ])).and(z.object({
    max: z.number().optional()
  })))
});

export const CoreSchema = z.object({
  JOB_WAIT: z.number(),
  NO_JOB_WAIT: z.number(),
  DEV_INJECT: z.boolean(),
  DRY_RUN: z.boolean()
});

export const ClientSchema = z.object({
  ENDPOINT: z.url(),
  USERNAME: z.string().min(1),
  PASSWORD: z.string().min(1),
  TYPE: z.enum(["qbittorrent", "deluge"])
});

export const NamingConfigSchema = z.object({
  RENAME: z.boolean(),
  SCHEME: z.string(),
  REPLACE: z.record(z.string(), z.string()),
  REDUNDANT_FLAGS: z.record(z.enum(stringKeys), z.array(z.object({
    match: z.array(z.union([z.string(), z.number()])),
    keep: z.union([z.string(), z.number()])
  })).optional()),
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

export const SortConfigSchema = z.object({
  SORT: z.boolean(),
  MOVE_DELAY: z.number().int().nonnegative(),
  MAX_MOVES_PER_CYCLE: z.number().int().nonnegative(),
  MIN_API_CALLS_PER_CYCLE: z.number().int().nonnegative(),
  MAX_API_CALLS_PER_CYCLE: z.number().int().nonnegative(),
  METHODS: z.array(SelectorSchema)
});

export const QueueSchema = z.object({
  QUEUE_SIZE_LIMIT: z.number(),
  HARD_QUEUE_SIZE_LIMIT: z.boolean(),
  INCLUDE_MOVING_TORRENTS: z.boolean(),
  EXCLUDE_CATEGORIES: z.array(z.string()),
  MINIMUM_QUEUE_SIZE: z.number(),
  MAXIMUM_QUEUE_SIZE: z.number(),
  MINIMUM_SEEDERS: z.number()
});

export const DuplicatesSchema = z.object({
  TIE_BREAKERS: z.array(SelectorSchema),
  FILTERS: z.array(SelectorSchema)
});

export const MetadataSchema = z.object({
  TORRENT_PATH: z.string().min(1),
  sources: z.array(z.object({
    url: z.tuple([z.url(), z.union([z.string(), z.void()])])
  }))
});
