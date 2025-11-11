/* eslint-disable max-lines-per-function */
import z from "zod";
import { logContext } from "../log";
import type Client from "../clients/client";
import { CachedValue, CacheEngine } from "./CacheEngine";

export const properties = {
  String: {
    state: z.enum(['stoppedDL', 'stalledDL', 'stalledUP', 'queuedDL', 'checkingUP', 'checkingDL', 'stoppedUP', 'missingFiles', 'downloading', 'moving', 'uploading', 'checkingResumeData', "error", "metaDL", "forcedMetaDL", "queuedUP", "forcedDL", "forcedUP"]),
    hash: z.string().nonempty(),
    magnet_uri: z.string(),
    name: z.string(),
    category: z.string().nullable(),
    tracker: z.string(),
    save_path: z.string()
  },
  Number: {
    size: z.number(),
    priority: z.number(),
    completed: z.number().nullable(),
    progress: z.number(),
    amount_left: z.number().nullable(),
    added_on: z.number(),
    num_complete: z.number(),
    eta: z.number(),
    ratio: z.number(),
    uploaded: z.number(),
    downloaded: z.number(),
    seeding_time: z.number(),
    real_amount_left: z.number().optional(),
  },
  Boolean: {
    private: z.boolean().nullable(),
    seq_dl: z.boolean(),
    auto_tmm: z.boolean(),
  },
  Array: {
    tags: z.codec(z.string(), z.array(z.string()), { decode: (str) => str.split(', '), encode: (arr) => arr.join(', ') }),
  }
}

export const TorrentSchema = z.object({ ...properties.String, ...properties.Number, ...properties.Boolean, ...properties.Array }).superRefine(t => {
  // When checking a partially completed torrent, amount_left counts total unverified OR missing pieces. This property uses progress to calculate only unverified pieces.
  t.real_amount_left = t.size * (1 - t.progress)
});

export type TorrentType = z.infer<typeof TorrentSchema>;

const SINGULAR_HASH_ENDPOINTS = ['rename', 'renameFile'];

export const TorrentObjectSchema = z.object({
  get: z.custom<() => TorrentType>(),
  files: z.custom<() => Promise<{ name: string }[] | null>>(),
  start: z.custom<() => Promise<number>>(),
  stop: z.custom<() => Promise<number>>(),
  recheck: z.custom<() => Promise<number>>(),
  delete: z.custom<(arg: boolean) => Promise<number>>(),
  setCategory: z.custom<(arg: string) => Promise<number>>(),
  rename: z.custom<(arg: string) => Promise<number>>(),
  renameFile: z.custom<(arg: string, arg2: string) => Promise<number>>(),
  toggleSequentialDownload: z.custom<() => Promise<number>>(),
  setAutoManagement: z.custom<(arg: boolean) => Promise<number>>(),
  removeTags: z.custom<(arg: string[]) => Promise<number>>(),
  addTags: z.custom<(arg: string[]) => Promise<number>>(),
});

const filesCache = new CachedValue<Record<string, { name: string }[] | undefined>>(new CacheEngine({ name: 'cachedFiles' }), 'files', {}, 1000*60*60*24);

const Torrent = (client: Client, data: TorrentType): z.infer<typeof TorrentObjectSchema> => {
  const request = (method: string, rest: { category?: string; name?: string; oldPath?: string; newPath?: string; deleteFiles?: boolean; tags?: string; enable?: boolean } = {}): Promise<string | false> => {
    const { enable, deleteFiles, ...restWithoutProps } = rest;
    const payload = {
      ...restWithoutProps,
      ...(new URLSearchParams(method.split('?')[1]).get('hash') === null && { [`hash${SINGULAR_HASH_ENDPOINTS.includes(method) ? '' : 'es'}`]: data.hash }),
      ...(typeof enable !== "undefined" && { enable: enable ? 'true' : 'false' }),
      ...(typeof deleteFiles !== "undefined" && { deleteFiles: deleteFiles ? 'true' : 'false' })
    };
    if (Object.keys(payload).length) logContext('qBittorrent', () => { console.log(`${data.hash} Calling ${method}`, Object.keys(rest).length === 0 ? '' : rest); });
    return client.request(`/torrents/${method}`, new URLSearchParams(payload));
  }

  const recheck = async (): Promise<number> => {
    data.state = data.progress === 1 ? 'checkingUP' : 'checkingDL';
    return await request('recheck') === false ? 0 : 1;
  };

  return {
    get: (): TorrentType => data,
    files: async (): Promise<{ name: string }[] | null> => {
      const cacheResult = filesCache.value[data.hash];
      if (cacheResult) return cacheResult;
      const res = await request(`files?hash=${data.hash}`);
      if (res === false) return null;
      const result = z.array(z.object({ name: z.string() })).parse(JSON.parse(res));
      filesCache.value[data.hash] = result;
      return result;
    },
    start: async (): Promise<number> => await request('start') === false ? 0 : 1,
    stop: async (): Promise<number> => {
      data.state = data.progress === 1 ? 'stoppedUP' : 'stoppedDL';
      return await request('stop') === false ? 0 : 1;
    },
    recheck,
    delete: async (deleteFiles = false): Promise<number> => await request('delete', { deleteFiles }) === false ? 0 : 1,
    setCategory: async (category: string): Promise<number> => {
      data.category = category;
      return await request('setCategory', { category }) === false ? 0 : 1;
    },
    rename: async (name: string): Promise<number> => {
      if (name === data.name) return 0;
      data.name = name;
      return await request('rename', { name }) === false ? 0 : 1;
    },
    renameFile: async (oldPath: string, newPath: string): Promise<number> => await request('renameFile', { oldPath, newPath }) === false ? 0 : 1,
    toggleSequentialDownload: async (): Promise<number> => {
      data.seq_dl = !data.seq_dl;
      return await request('toggleSequentialDownload') === false ? 0 : 1;
    },
    setAutoManagement: async (enable: boolean): Promise<number> => {
      data.auto_tmm = enable;
      return await request('setAutoManagement', { enable }) === false ? 0 : 1;
    },
    removeTags: async (tags: string[]): Promise<number> => {
      const splitTags = tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
      const removableTags = splitTags.filter(tag => data.tags.includes(tag));
      if (removableTags.length === 0) return Promise.resolve(0);
      for (const tag of removableTags) data.tags.splice(data.tags.indexOf(tag), 1);
      return await request('removeTags', { tags: removableTags.join(', ') }) === false ? 0 : 1;;
    },
    addTags: async (tags: string[]): Promise<number> => {
      const splitTags = tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
      const newTags = splitTags.filter(tag => !data.tags.includes(tag));
      if (newTags.length === 0) return Promise.resolve(0);
      for (const tag of newTags) data.tags.push(tag);
      return await request('addTags', { tags: newTags.join(', ') }) === false ? 0 : 1;;
    }
  }
}

export default Torrent;
