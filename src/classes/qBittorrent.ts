import fs from 'fs';
import z, { ZodError } from "zod";
import { CONFIG } from "../config";
import Torrent from './Torrent';
import { TorrentSchema } from './Torrent';
import { logContext } from '../log';

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
      logContext('qBittorrent', () => console.log('Already logged in'));
      return resolve(fs.readFileSync('./store/cookies.txt').toString());
    }
    logContext('qBittorrent', () => console.log('Logging in'));
    const attempt = () => this.login().then(res => {
      if (res) {
        logContext('qBittorrent', () => console.log('Logged in'))
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
      const response = await fetch(`${CONFIG.CLIENT().ENDPOINT}/api/v2${path}`, { method: body ? 'POST' : undefined, body, headers: { Cookie: await this.cookie } });
      if (response.status === 403) {
        if (typeof this.cookie === "string") {
          logContext('qBittorrent', () => console.log('Creating new session'));
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

  public async torrents(): Promise<Torrent[]> {
    const response = await this.request('/torrents/info')
    if (!response) return [];
    let data: unknown;
    try {
      data = JSON.parse(response);
      // console.log(data[0])
      // process.exit()
      const torrents = z.array(TorrentSchema).parse(data);
      logContext('qBittorrent', () => console.log(`Fetched ${torrents.length} torrents`));
      return torrents.sort((a, b) => a.priority - b.priority).map(t => new Torrent(this, t));
    } catch (e) {
        console.error(e);
        if (e instanceof ZodError) {
          let item = data;
          const path = e.issues[0]!.path as (string | number)[];
          for (const part of path) {
            // @ts-expect-error: Types are inherently unknown
            item = item[part];
            console.log(item);
          }
        }
        process.exit();
    }
    return [];
  }
}
