import Torrent from "../classes/Torrent";
import { CONFIG } from "../config";
import { logContext } from "../log";
import Qbittorrent from "./qBittorrent";

export default class Client {
  constructor(private readonly client: Qbittorrent) {}

  static connect = async (): Promise<Client> => {
    const config = CONFIG.CLIENT();
    let client;
    if (config.TYPE === "qbittorrent") client = await Qbittorrent.connect();
    else throw new Error('Unsupported client');
    return new Client(client);
  }

  public request = (path: `/${string}`, body?: URLSearchParams | FormData): Promise<string | false> => this.client.request(path, body);

  public torrents = async (): Promise<Torrent[]> => (await this.client.torrents()).map(t => new Torrent(this, t));

  public add = (data: Buffer): Promise<string | false> => {
    logContext('qBittorrent', () => { console.log(`Adding Torrent`); });
    return this.client.add(data);
  }

  public getMaxActiveDownloads = (): Promise<number | false> => this.client.getMaxActiveDownloads();
  public setMaxActiveDownloads = (maxActiveDownloads: number): Promise<number> => this.client.setMaxActiveDownloads(maxActiveDownloads);

  public topPriority = (hashes: string[]): Promise<string | false> => {
    logContext('qBittorrent', () => { console.log(`${hashes[hashes.length-1]} Moving to position ${hashes.length}`); });
    return this.client.topPriority(hashes);
  }
}
