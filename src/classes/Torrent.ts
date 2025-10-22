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

type Undefinable<T> = { [P in keyof T]: T[P] | undefined };
type PartialTorrentType = Undefinable<TorrentType> & { hash: string }

const SINGULAR_HASH_ENDPOINTS = ['rename', 'renameFile'];

export class PartialTorrent implements PartialTorrentType { 
  public readonly hash!: TorrentType['hash'];
  public readonly state: PartialTorrentType['state'];
  public readonly magnet_uri: PartialTorrentType['magnet_uri'];
  public readonly name: PartialTorrentType['name'];
  public readonly size: PartialTorrentType['size'];
  public readonly priority: PartialTorrentType['priority'];
  public readonly category: PartialTorrentType['category'];
  public readonly tags: PartialTorrentType['tags'];
  public readonly completed: PartialTorrentType['completed'];
  public readonly progress: PartialTorrentType['progress'];
  public readonly private: PartialTorrentType['private'];
  public readonly amount_left: PartialTorrentType['amount_left'];
  public readonly seq_dl: PartialTorrentType['seq_dl'];
  public readonly auto_tmm: PartialTorrentType['auto_tmm'];
  public readonly added_on: PartialTorrentType['added_on'];
  public readonly num_complete: PartialTorrentType['num_complete'];
  public readonly tracker: PartialTorrentType['tracker'];
  public readonly eta: PartialTorrentType['eta'];
  declare readonly ratio: PartialTorrentType['ratio'];
  declare readonly uploaded: PartialTorrentType['uploaded'];
  declare readonly downloaded: PartialTorrentType['downloaded'];

  constructor(private readonly client: Client, data: PartialTorrentType) {
    Object.assign(this, data);
  }

  private request = (method: string, rest: { category?: string; name?: string; oldPath?: string; newPath?: string; deleteFiles?: boolean; tags?: string; enable?: boolean } = {}): Promise<string | false> => {
    const { enable, deleteFiles, ...restWithoutProps } = rest;
    const payload = {
      ...restWithoutProps,
      ...(new URLSearchParams(method.split('?')[1]).get('hash') === null && { [`hash${  SINGULAR_HASH_ENDPOINTS.includes(method) ? '' : 'es'}`]: this.hash }),
      ...(typeof enable !== "undefined" && { enable: enable ? 'true' : 'false' }),
      ...(typeof deleteFiles !== "undefined" && { deleteFiles: deleteFiles ? 'true' : 'false' })
    };

    if (Object.keys(payload).length) logContext('qBittorrent', () => { console.log(`${this.hash} Calling ${method}`, Object.keys(rest).length === 0 ? '' : rest); });
    return this.client.request(`/torrents/${method}`, new URLSearchParams(payload));
  }

  public files = async (): Promise<{ name: string }[] | false> => {
    const data = await this.request(`files?hash=${this.hash}`);
    if (data === false) return false;
    return z.array(z.object({ name: z.string() })).parse(JSON.parse(data));
  }

  public start = async (): Promise<number> => await this.request('start') === false ? 0 : 1;
  public stop = async (): Promise<number> => {
    this.state = this.progress === 1 ? 'stoppedUP' : 'stoppedDL';
    return await this.request('stop') === false ? 0 : 1;
  }
  public recheck = async (): Promise<number> => {
    this.state = this.progress === 1 ? 'checkingUP' : 'checkingDL';
    return await this.request('recheck') === false ? 0 : 1;
  }
  public delete = async (): Promise<number> => await this.request('delete', { deleteFiles: false }) === false ? 0 : 1;;
  public setCategory = async (category: string): Promise<string | false> => {
    this.category = category;
    return await this.request('setCategory', { category });
  }
  public rename = async (name: string): Promise<number> => {
    if (name === this.name) return 0;
    this.name = name;
    return await this.request('rename', { name }) === false ? 0 : 1;
  }
  public renameFile = async (oldPath: string, newPath: string): Promise<string | false> => {
    const result = await this.request('renameFile', { oldPath, newPath });
    if (CONFIG.NAMING().RECHECK_ON_RENAME && result !== false) await this.recheck();
    return result;
  }
  public toggleSequentialDownload = async (): Promise<number> => {
    this.seq_dl = !this.seq_dl;
    return await this.request('toggleSequentialDownload') === false ? 0 : 1;
  }
  public setAutoManagement = async (enable: boolean): Promise<number> => {
    this.auto_tmm = enable;
    return await this.request('setAutoManagement', { enable }) === false ? 0 : 1;
  }
  public removeTags = async (tags: string): Promise<number> => {
    const splitTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    const removableTags = splitTags.filter(tag => this.tags?.includes(tag) === true);
    if (removableTags.length === 0) return Promise.resolve(0);
    for (const tag of removableTags) this.tags?.splice(this.tags.indexOf(tag), 1);
    return await this.request('removeTags', { tags: removableTags.join(', ') }) === false ? 0 : 1;;
  };
  public addTags = async (tags: string): Promise<number> => {
    const splitTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    const newTags = splitTags.filter(tag => this.tags?.includes(tag) !== true);
    if (newTags.length === 0) return Promise.resolve(0);
    for (const tag of newTags) this.tags?.push(tag);
    return await this.request('addTags', { tags: newTags.join(', ') }) === false ? 0 : 1;;
  }
}

export default class Torrent extends PartialTorrent implements TorrentType {
  declare readonly state: TorrentType['state'];
  declare readonly magnet_uri: TorrentType['magnet_uri'];
  declare readonly name: TorrentType['name'];
  declare readonly size: TorrentType['size'];
  declare readonly priority: TorrentType['priority'];
  declare readonly category: TorrentType['category'];
  declare readonly tags: TorrentType['tags'];
  declare readonly completed: TorrentType['completed'];
  declare readonly progress: TorrentType['progress'];
  declare readonly private: TorrentType['private'];
  declare readonly amount_left: TorrentType['amount_left'];
  declare readonly seq_dl: TorrentType['seq_dl'];
  declare readonly added_on: TorrentType['added_on'];
  declare readonly auto_tmm: TorrentType['auto_tmm'];
  declare readonly num_complete: TorrentType['num_complete'];
  declare readonly tracker: TorrentType['tracker'];
  declare readonly eta: TorrentType['eta'];
  declare readonly ratio: TorrentType['ratio'];
  declare readonly uploaded: TorrentType['uploaded'];
  declare readonly downloaded: TorrentType['downloaded'];

  constructor(client: Client, data: PartialTorrentType) {
    super(client, data);
    Object.assign(this, data);
  }
}
