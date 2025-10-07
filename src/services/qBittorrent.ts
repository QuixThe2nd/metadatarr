import fs from 'fs';
import z, { ZodError } from "zod";
import { CONFIG } from "../config";

const TorrentSchema = z.object({
  state: z.enum(['stoppedDL', 'stalledDL', 'stalledUP', 'queuedDL', 'checkingUP', 'checkingDL', 'stoppedUP', 'missingFiles', 'downloading', 'moving', 'uploading', 'checkingResumeData', "error", "metaDL", "queuedUP", "forcedDL", "forcedUP"]),
  hash: z.string().nonempty(),
  magnet_uri: z.string(),
  name: z.string(),
  size: z.number(),
  priority: z.number(),
  category: z.string().nullable(),
  tags: z.string(),
  completed: z.number().nullable(),
  progress: z.number(),
  private: z.boolean().nullable(),
  amount_left: z.number().nullable(),
  seq_dl: z.boolean(),
  added_on: z.number()
});
export type Torrent = z.infer<typeof TorrentSchema>;

const PreferencesSchema = z.object({
  max_active_downloads: z.number()
});
type Preferences = z.infer<typeof PreferencesSchema>;

export default class Qbittorrent {
  private constructor(private cookie: string | Promise<string>) {}

  static connect = async (): Promise<Qbittorrent> => new Qbittorrent(await this.getCookie());

  private static login = async (): Promise<string | false> => {
    const client = CONFIG.CLIENT();
    try {
      const response = await fetch(`${client.ENDPOINT}/api/v2/auth/login`, { method: 'POST', body: new URLSearchParams({ username: client.USERNAME, password: client.PASSWORD }) });
      const cookie = response.headers.get('set-cookie');
      if (!cookie) throw new Error("[qBittorrent] Failed to login");
      fs.writeFileSync('./store/cookies.txt', cookie);
      return cookie;
    } catch (e) {
      console.error('[qBittorrent] Failed to login', e);
      return false;
    }
  }

  private static getCookie = async (force = false) => await new Promise<string>(resolve => {
    if (!force && fs.existsSync('./store/cookies.txt')) {
      console.log('\x1b[32m[qBittorrent]\x1b[0m Already logged in');
      return resolve(fs.readFileSync('./store/cookies.txt').toString());
    }
    console.log('\x1b[32m[qBittorrent]\x1b[0m Logging in');
    const attempt = () => this.login().then(res => {
      if (res) {
        console.log('\x1b[32m[qBittorrent]\x1b[0m Logged in')
        resolve(res);
      } else setTimeout(() => {
        attempt().catch(console.error)
      }, 30_000);
    });
    attempt().catch(console.error);
  });

  private async request(path: `/${string}`, body?: URLSearchParams | FormData): Promise<string | false> {
    try {
      const response = await fetch(`${CONFIG.CLIENT().ENDPOINT}/api/v2${path}`, { method: body ? 'POST' : undefined, body, headers: { Cookie: await this.cookie } });
      if (response.status === 403) {
        if (typeof this.cookie === "string") {
          console.log('\x1b[32m[qBittorrent]\x1b[0m Creating new session');
          this.cookie = Qbittorrent.getCookie(true);
        }
        this.cookie = await this.cookie;
        return this.request(path, body);
      }
      if (!response.ok) {
        console.error(`[qBittorrent] Request failed - ${response.status} ${response.statusText} - ${await response.text()}`);
        return false;
      }
      return await response.text();
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  private torrentMethod = (method: string, hashes: string | string[], rest?: { category?: string; name?: string; oldPath?: string; newPath?: string; deleteFiles?: boolean; tags?: string }) => {
    const payload: { category?: string; hash?: string; hashes?: string } = rest ?? {};
    if (typeof hashes === "string") payload.hash = hashes;
    else payload.hashes = hashes.join('|');
    console.log(`\x1b[32m[qBittorrent]\x1b[0m ${typeof hashes === 'string' ? hashes : hashes[0]} Calling ${method}`, rest ?? '');
    return this.request(`/torrents/${method}`, new URLSearchParams(payload));
  }
  public start = (hashes: string[]) => this.torrentMethod('start', hashes);
  public recheck = (hashes: string[]) => this.torrentMethod('recheck', hashes);
  public delete = (hashes: string[]) => this.torrentMethod('delete', hashes, { deleteFiles: false });
  public topPriority = (hashes: string[]) => this.torrentMethod('topPrio', hashes);
  public setCategory = (hashes: string[], category: string) => this.torrentMethod('setCategory', hashes, { category });
  public rename = (hash: string, name: string) => this.torrentMethod('rename', hash, { name });
  public renameFile = async (hash: string, oldPath: string, newPath: string) => {
    const result = await this.torrentMethod('renameFile', hash, { oldPath, newPath });
    if (CONFIG.NAMING().RECHECK_ON_RENAME && result !== false) await this.recheck([hash]);
    return result;
  }
  public toggleSequentialDownload = (hashes: string[]) => this.torrentMethod('toggleSequentialDownload', hashes);
  public removeTags = (hashes: string[], tags: string) => this.torrentMethod('removeTags', hashes, { tags });
  public addTags = (hashes: string[], tags: string) => this.torrentMethod('addTags', hashes, { tags });

  public getPreferences = async () => {
    const result = await this.request('/app/preferences');
    if (!result) return false;
    return PreferencesSchema.parse(JSON.parse(result))
  }

  public setPreferences = (preferences: Partial<Preferences>) => {
    const fd = new URLSearchParams();
    fd.set('json', JSON.stringify(preferences))
    return this.request('/app/setPreferences', fd)
  }

  public files = async (hash: string): Promise<{ name: string }[] | false> => {
    const data = await this.request(`/torrents/files?hash=${hash}`);
    if (!data) return false;
    return z.array(z.object({ name: z.string() })).parse(JSON.parse(data));
  }

  public add = (torrent: Buffer) => {
    const body = new FormData();
    body.append('torrents', new Blob([Uint8Array.from(torrent)]), 'torrent.torrent');
    return this.request('/torrents/add', body);
  }
  public async torrents(): Promise<Torrent[]> {
    const response = await this.request('/torrents/info')
    if (!response) return [];
    let data: unknown;
    try {
      data = JSON.parse(response);
      const torrents = z.array(TorrentSchema).parse(data);
      console.log(`\x1b[32m[qBittorrent]\x1b[0m Fetched ${torrents.length} torrents`);
      return torrents.sort((a, b) => a.priority - b.priority);
    } catch (e) {
        if (e instanceof ZodError) {
          let item = data;
          const path = e.issues[0]!.path as (string | number)[];
          for (const part of path) {
            // @ts-expect-error: Types are inherently unknown
            item = item[part];
            console.log(item);
          }
          console.error(e)
        } else console.error(e);
        process.exit();
    }
    return [];
  }
}
