import fs from 'fs';
import z, { ZodError } from "zod";
import Torrent from './Torrent';
import { TorrentSchema } from './Torrent';
import { logContext } from '../log';
import { CONFIG } from '../config';

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
      if (cookie === null) throw new Error("[qBittorrent] Failed to login");
      fs.writeFileSync('./store/cookies.txt', cookie);
      return cookie;
    } catch (e) {
      console.error('[qBittorrent] Failed to login', e);
      return false;
    }
  }

  private static getCookie = (force = false): Promise<string> => new Promise<string>(resolve => {
    if (!force && fs.existsSync('./store/cookies.txt')) {
      logContext('qBittorrent', () => { console.log('Already logged in'); });
      resolve(fs.readFileSync('./store/cookies.txt').toString()); return;
    }
    logContext('qBittorrent', () => { console.log('Logging in'); });
    const attempt = (): Promise<void> => this.login().then(res => {
      if (res !== false) {
        logContext('qBittorrent', () => { console.log('Logged in'); })
        resolve(res);
      } else setTimeout(() => {
        attempt().catch(console.error)
      }, 30_000);
    });
    attempt().catch(console.error);
  });

  public async request(path: `/${string}`, body?: URLSearchParams | FormData): Promise<string | false> {
    if ([...body ?? []].length === 0) body = undefined;
    if (body && CONFIG.CORE().DRY_RUN) {
      console.log('[DRY RUN] Not executing', path)
      return '';
    }
    // console.log(`${CONFIG.CLIENT().ENDPOINT}/api/v2${path}`, { method: body ? 'POST' : undefined, body, headers: { Cookie: await this.cookie } })
    try {
      const response = await fetch(`${CONFIG.CLIENT().ENDPOINT}/api/v2${path}`, { ...(body && { method: 'POST', body }), headers: { Cookie: await this.cookie } });
      if (response.status === 403) {
        if (typeof this.cookie === "string") {
          logContext('qBittorrent', () => { console.log('Creating new session'); });
          this.cookie = Qbittorrent.getCookie(true);
        }
        this.cookie = await this.cookie;
        return await this.request(path, body);
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

  public getPreferences = async (): Promise<Preferences | false> => {
    const result = await this.request('/app/preferences');
    if (result === false) return false;
    return PreferencesSchema.parse(JSON.parse(result))
  }

  public setPreferences = async (preferences: Partial<Preferences>): Promise<number> => {
    const fd = new URLSearchParams();
    fd.set('json', JSON.stringify(preferences))
    return await this.request('/app/setPreferences', fd) === false ? 0 : 1;
  }

  public async torrents(): Promise<Torrent[]> {
    logContext('qBittorrent', () => { console.log('Fetching torrents'); });
    const response = await this.request('/torrents/info')
    logContext('qBittorrent', () => { console.log('Fetched torrents'); });
    if (response === false) return [];
    let data: unknown;
    try {
      data = JSON.parse(response);
      // console.log(data[0])
      // process.exit()
      const torrents = z.array(TorrentSchema).parse(data);
      logContext('qBittorrent', () => { console.log(`Fetched ${torrents.length} torrents`); });
      return torrents.sort((a, b) => a.priority - b.priority).map(t => new Torrent(this, t));
    } catch (e) {
        console.error(e);
        if (e instanceof ZodError) {
          let item = data;
          const path = e.issues[0]?.path as (string | number)[];
          for (const part of path) {
            // @ts-expect-error: Types are inherently unknown
            item = item[part];
            console.log(item);
          }
        }
        process.exit();
    }
  }

  public topPriority = async (hashes: string[]): Promise<number> => {
    logContext('qBittorrent', () => { console.log(`${hashes[hashes.length-1]} Moving to position ${hashes.length}`); });
    return await this.request('/torrents/topPrio', new URLSearchParams({ hashes: hashes.join('|') })) === false ? 0 : 1;
  }
}
