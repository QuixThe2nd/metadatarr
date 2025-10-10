import z from "zod";
import Qbittorrent from './qBittorrent';
import { CONFIG } from "../config";
import { logContext } from "../log";

export const TorrentSchema = z.object({
  state: z.enum(['stoppedDL', 'stalledDL', 'stalledUP', 'queuedDL', 'checkingUP', 'checkingDL', 'stoppedUP', 'missingFiles', 'downloading', 'moving', 'uploading', 'checkingResumeData', "error", "metaDL", "queuedUP", "forcedDL", "forcedUP"]),
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
  num_complete: z.number()
});
type TorrentType = z.infer<typeof TorrentSchema>;

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

  constructor(private readonly qB: Qbittorrent, data: PartialTorrentType) {
    Object.assign(this, data);
  }

  static add = (qB: Qbittorrent, data: Buffer) => {
    logContext('qBittorrent', () => console.log(`Adding Torrent`));
    const body = new FormData();
    body.append('torrents', new Blob([Uint8Array.from(data)]), 'torrent.torrent');
    return qB.request('/torrents/add', body);
  }

  private request = (method: string, rest: { category?: string; name?: string; oldPath?: string; newPath?: string; deleteFiles?: boolean; tags?: string; enable?: boolean } = {}) => {
    const { enable, deleteFiles, ...restWithoutProps } = rest;
    const payload = {
      ...restWithoutProps,
      ...(new URLSearchParams(method.split('?')[1]).get('hash') === null && { ['hash' + (SINGULAR_HASH_ENDPOINTS.includes(method) ? '' : 'es')]: this.hash }),
      ...(typeof enable !== "undefined" && { enable: enable ? 'true' : 'false' }),
      ...(typeof deleteFiles !== "undefined" && { deleteFiles: deleteFiles ? 'true' : 'false' })
    };

    if (Object.keys(payload).length) logContext('qBittorrent', () => console.log(`${this.hash} Calling ${method}`, rest ?? ''));
    return this.qB.request(`/torrents/${method}`, new URLSearchParams(payload));
  }

  public files = async (): Promise<{ name: string }[] | false> => {
    const data = await this.request(`files?hash=${this.hash}`);
    if (!data) return false;
    return z.array(z.object({ name: z.string() })).parse(JSON.parse(data));
  }

  public start = () => this.request('start');
  public recheck = () => this.request('recheck');
  public delete = () => this.request('delete', { deleteFiles: false });
  public setCategory = (category: string) => this.request('setCategory', { category });
  public rename = (name: string) => this.request('rename', { name });
  public renameFile = async (oldPath: string, newPath: string) => {
    const result = await this.request('renameFile', { oldPath, newPath });
    if (CONFIG.NAMING().RECHECK_ON_RENAME && result !== false) await this.recheck();
    return result;
  }
  public toggleSequentialDownload = () => this.request('toggleSequentialDownload');
  public setAutoManagement = (enable: boolean) => this.request('setAutoManagement', { enable });
  public removeTags = (tags: string) => this.request('removeTags', { tags });
  public addTags = (tags: string) => this.request('addTags', { tags });
}

export default class Torrent extends PartialTorrent implements TorrentType {
  declare state: TorrentType['state'];
  declare magnet_uri: TorrentType['magnet_uri'];
  declare name: TorrentType['name'];
  declare size: TorrentType['size'];
  declare priority: TorrentType['priority'];
  declare category: TorrentType['category'];
  declare tags: TorrentType['tags'];
  declare completed: TorrentType['completed'];
  declare progress: TorrentType['progress'];
  declare private: TorrentType['private'];
  declare amount_left: TorrentType['amount_left'];
  declare seq_dl: TorrentType['seq_dl'];
  declare added_on: TorrentType['added_on'];
  declare auto_tmm: TorrentType['auto_tmm'];
  declare num_complete: TorrentType['num_complete'];

  constructor(qB: Qbittorrent, data: PartialTorrentType) {
    super(qB, data);
    Object.assign(this, data);
  }
}
