import z from "zod";
import { logContext } from "../log";
import { CONFIG } from "../config";
import type Client from "../clients/client";

export const TorrentSchema = z.object({
  state: z.enum(['stoppedDL', 'stalledDL', 'stalledUP', 'queuedDL', 'checkingUP', 'checkingDL', 'stoppedUP', 'missingFiles', 'downloading', 'moving', 'uploading', 'checkingResumeData', "error", "metaDL", "forcedMetaDL", "queuedUP", "forcedDL", "forcedUP"]),
  hash: z.string().nonempty(),
  magnet_uri: z.string(),
  name: z.string(),
  size: z.number(),
  priority: z.number(),
  category: z.string().nullable(),
  tags: z.codec(z.string(), z.array(z.string()), { decode: (str) => str.split(', '), encode: (arr) => arr.join(', ') }),
  completed: z.number().nullable(),
  progress: z.number(),
  private: z.boolean().nullable(),
  amount_left: z.number().nullable(),
  seq_dl: z.boolean(),
  auto_tmm: z.boolean(),
  added_on: z.number(),
  num_complete: z.number(),
  tracker: z.string(),
  eta: z.number(),
  ratio: z.number(),
  uploaded: z.number(),
  downloaded: z.number()
});
export type TorrentType = z.infer<typeof TorrentSchema>;

const SINGULAR_HASH_ENDPOINTS = ['rename', 'renameFile'];

export default class Torrent implements TorrentType {
  get state(): TorrentType['state'] { return this.data.state }
  get hash(): TorrentType['hash'] { return this.data.hash }
  get magnet_uri(): TorrentType['magnet_uri'] { return this.data.magnet_uri }
  get name(): TorrentType['name'] { return this.data.name }
  get size(): TorrentType['size'] { return this.data.size }
  get priority(): TorrentType['priority'] { return this.data.priority }
  get category(): TorrentType['category'] { return this.data.category }
  get tags(): TorrentType['tags'] { return this.data.tags }
  get completed(): TorrentType['completed'] { return this.data.completed }
  get progress(): TorrentType['progress'] { return this.data.progress }
  get private(): TorrentType['private'] { return this.data.private }
  get amount_left(): TorrentType['amount_left'] { return this.data.amount_left }
  get seq_dl(): TorrentType['seq_dl'] { return this.data.seq_dl }
  get auto_tmm(): TorrentType['auto_tmm'] { return this.data.auto_tmm }
  get added_on(): TorrentType['added_on'] { return this.data.added_on }
  get num_complete(): TorrentType['num_complete'] { return this.data.num_complete }
  get tracker(): TorrentType['tracker'] { return this.data.tracker }
  get eta(): TorrentType['eta'] { return this.data.eta }
  get ratio(): TorrentType['ratio'] { return this.data.ratio }
  get uploaded(): TorrentType['uploaded'] { return this.data.uploaded }
  get downloaded(): TorrentType['downloaded'] { return this.data.downloaded }

  constructor(private readonly client: Client, private readonly data: TorrentType) {}

  private request = (method: string, rest: { category?: string; name?: string; oldPath?: string; newPath?: string; deleteFiles?: boolean; tags?: string; enable?: boolean } = {}): Promise<string | false> => {
    const { enable, deleteFiles, ...restWithoutProps } = rest;
    const payload = {
      ...restWithoutProps,
      ...(new URLSearchParams(method.split('?')[1]).get('hash') === null && { [`hash${SINGULAR_HASH_ENDPOINTS.includes(method) ? '' : 'es'}`]: this.hash }),
      ...(typeof enable !== "undefined" && { enable: enable ? 'true' : 'false' }),
      ...(typeof deleteFiles !== "undefined" && { deleteFiles: deleteFiles ? 'true' : 'false' })
    };

    if (Object.keys(payload).length) logContext('qBittorrent', () => { console.log(`${this.data.hash} Calling ${method}`, Object.keys(rest).length === 0 ? '' : rest); });
    return this.client.request(`/torrents/${method}`, new URLSearchParams(payload));
  }

  public files = async (): Promise<{ name: string }[] | false> => {
    const data = await this.request(`files?hash=${this.data.hash}`);
    if (data === false) return false;
    return z.array(z.object({ name: z.string() })).parse(JSON.parse(data));
  }

  public start = async (): Promise<number> => await this.request('start') === false ? 0 : 1;
  public stop = async (): Promise<number> => {
    this.data.state = this.data.progress === 1 ? 'stoppedUP' : 'stoppedDL';
    return await this.request('stop') === false ? 0 : 1;
  }
  public recheck = async (): Promise<number> => {
    this.data.state = this.data.progress === 1 ? 'checkingUP' : 'checkingDL';
    return await this.request('recheck') === false ? 0 : 1;
  }
  public delete = async (): Promise<number> => await this.request('delete', { deleteFiles: false }) === false ? 0 : 1;;
  public setCategory = (category: string): Promise<string | false> => {
    this.data.category = category;
    return this.request('setCategory', { category });
  }
  public rename = async (name: string): Promise<number> => {
    if (name === this.data.name) return 0;
    this.data.name = name;
    return await this.request('rename', { name }) === false ? 0 : 1;
  }
  public renameFile = async (oldPath: string, newPath: string): Promise<string | false> => {
    const result = await this.request('renameFile', { oldPath, newPath });
    if (CONFIG.NAMING().RECHECK_ON_RENAME && result !== false) await this.recheck();
    return result;
  }
  public toggleSequentialDownload = async (): Promise<number> => {
    this.data.seq_dl = !this.data.seq_dl;
    return await this.request('toggleSequentialDownload') === false ? 0 : 1;
  }
  public setAutoManagement = async (enable: boolean): Promise<number> => {
    this.data.auto_tmm = enable;
    return await this.request('setAutoManagement', { enable }) === false ? 0 : 1;
  }
  public removeTags = async (tags: string): Promise<number> => {
    const splitTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    const removableTags = splitTags.filter(tag => this.data.tags.includes(tag));
    if (removableTags.length === 0) return Promise.resolve(0);
    for (const tag of removableTags) this.data.tags.splice(this.data.tags.indexOf(tag), 1);
    return await this.request('removeTags', { tags: removableTags.join(', ') }) === false ? 0 : 1;;
  };
  public addTags = async (tags: string): Promise<number> => {
    const splitTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    const newTags = splitTags.filter(tag => !this.data.tags.includes(tag));
    if (newTags.length === 0) return Promise.resolve(0);
    for (const tag of newTags) this.data.tags.push(tag);
    return await this.request('addTags', { tags: newTags.join(', ') }) === false ? 0 : 1;;
  }
}
