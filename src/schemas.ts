import { z } from 'zod';
import Torrent, { type TorrentType } from './classes/Torrent';
import type Client from './clients/client';

const objectKeys = <T extends object>(obj: T): (keyof T)[] => Object.keys(obj) as (keyof T)[];

const exclude = <T, E extends T>(arr: T[], excluded: readonly E[]): Exclude<T, E>[] => arr.filter(item => !(excluded as readonly T[]).includes(item)) as Exclude<T, E>[];

const actions = objectKeys(Torrent({} as Client, {} as TorrentType));
export const argedActions = ['setAutoManagement', 'addTags', 'removeTags', 'setCategory', 'rename', 'delete'] as const;
const excludedActions = ['get', 'renameFile', 'files'] as const;
export const filteredActions = exclude(actions, [...argedActions, ...excludedActions]);

export const TorrentInstructionSchema = z.union([
  z.object({ then: z.enum(argedActions), arg: z.union([z.boolean(), z.string()]) }),
  z.object({ then: z.enum(filteredActions) })
]);

export const CoreSchema = z.object({
  INSTRUCTION_WAIT: z.number().min(0).default(10),
  JOB_WAIT: z.number().default(5000),
  NO_JOB_WAIT: z.number().default(300000),
  DEV_INJECT: z.boolean().default(false),
  DRY_RUN: z.boolean().default(true)
});

export const ClientSchema = z.object({
  ENDPOINT: z.url().default("http://localhost:8080"),
  USERNAME: z.string().min(1).default("username"),
  PASSWORD: z.string().min(1).default("password"),
  TYPE: z.enum(["qbittorrent", "deluge"]).default("qbittorrent")
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
