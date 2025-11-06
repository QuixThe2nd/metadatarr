import { z } from 'zod';
import { QuerySchema } from './classes/SelectorEngine';
import Torrent, { type TorrentType } from './classes/Torrent';
import type Client from './clients/client';

const objectKeys = <T extends object>(obj: T): (keyof T)[] => Object.keys(obj) as (keyof T)[];

const exclude = <T, E extends T>(arr: T[], excluded: readonly E[]): Exclude<T, E>[] => arr.filter(item => !(excluded as readonly T[]).includes(item)) as Exclude<T, E>[];

const actions = objectKeys(Torrent({} as Client, {} as TorrentType));
export const argedActions = ['setAutoManagement', 'addTags', 'removeTags', 'setCategory', 'rename'] as const;
const excludedActions = ['get', 'renameFile', 'files'] as const;
export const filteredActions = exclude(actions, [...argedActions, ...excludedActions]);

export const TorrentInstructionSchema = z.union([
  z.object({ then: z.enum(argedActions), arg: z.union([z.boolean(), z.string()]) }),
  z.object({ then: z.enum(filteredActions) })
]);

const ActionSchema = z.object({ if: z.array(QuerySchema) }).and(TorrentInstructionSchema).and(z.object({
  max: z.number().optional()
}));

export type TorrentInstruction = z.infer<typeof TorrentInstructionSchema>;

export const ActionsSchema = z.object({
  ACTIONS: z.array(ActionSchema)
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

export const stringKeys = ['title', 'resolution', 'color', 'codec', 'source', 'encoder', 'group', 'audio', 'container', 'language', 'service', 'samplerate', 'bitdepth', 'channels', 'season', 'episode', 'year', 'downscaled'] as const;

export const NamingConfigSchema = z.object({
  ENABLED: z.boolean(),
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
  RESET_ON_FAIL: z.boolean(),
  TMDB_API_KEY: z.string()
});

export const SortConfigSchema = z.object({
  ENABLED: z.boolean(),
  MAX_MOVES_PER_CYCLE: z.number().int().nonnegative(),
  MIN_API_CALLS_PER_CYCLE: z.number().int().nonnegative(),
  MAX_API_CALLS_PER_CYCLE: z.number().int().nonnegative(),
  METHODS: z.array(QuerySchema)
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

export const MetadataSchema = z.object({
  ENABLED: z.boolean(),
  TORRENT_PATH: z.string().min(1),
  sources: z.array(z.object({
    url: z.tuple([z.url(), z.union([z.string(), z.void()])])
  }))
});

export const UncrossSeedSchema = z.object({
  FILTERS: z.array(QuerySchema)
});

const ExpandedTorrentSchema = TorrentInstructionSchema.and(
  z.object({ hash: z.string() })
);

export const InstructionSchema = z.union([
  ExpandedTorrentSchema,
  z.object({
    then: z.literal('setMaxActiveDownloads'),
    arg: z.number()
  }),
  z.object({
    then: z.literal('topPriority'),
    arg: z.array(z.string())
  }),
  z.object({
    then: z.literal('renameFile'),
    arg: z.tuple([z.string(), z.string()]),
    hash: z.string()
  })
]);

export type Instruction = z.infer<typeof InstructionSchema>;
