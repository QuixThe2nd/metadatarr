import type { Instance } from 'webtorrent';
import type { Source } from "../config";
import Torrent from "../classes/Torrent";
import { CONFIG } from '../config';

export default class FetchMetadata {
  private hash: string;
  private magnet_uri: string;

  private sources = CONFIG.METADATA().sources;
  public readonly state: Promise<void>;

  constructor(private readonly webtorrent: Instance, torrent: Torrent, private readonly saveMetadata: (metadata: Buffer, source: string) => Promise<void>) {
    this.hash = torrent.hash;
    this.magnet_uri = torrent.magnet_uri;
    this.state = this.fetchMetadata().catch(console.error);
  }

  private async fetchMetadata() {
    console.log(this.hash, "Fetching metadata");
    await this.fetchWebtorrent();
    await Promise.all(this.sources.sort(() => Math.random() - 0.5).map(source => this.fetchFromHTTP(source)));
  }

  private async fetchWebtorrent() {
    if (await this.webtorrent.get(this.hash)) return;
    console.log(this.hash, "\x1b[34m[WebTorrent]\x1b[0m Fetching metadata");
    this.webtorrent.add(this.magnet_uri, { destroyStoreOnDestroy: false }, torrent => this.saveMetadata(torrent.torrentFile, "WebTorrent"));
  }

  private async fetchFromHTTP(source: Source[number]): Promise<void> {
    const url = new URL(`${source.url[0]}${this.hash}${source.url[1] ?? ''}`);
    try {
      console.log(this.hash, `\x1b[34m[${url.hostname}]\x1b[0m Fetching metadata`);
      const response = await fetch(url);
      if (response.status === 404) console.warn(this.hash, `[${url.hostname}] No metadata found`);
      else if (!response.ok) console.warn(this.hash, `[${url.hostname}] Failed to fetch metadata - ${response.status} ${response.statusText}`);
      else if (response.headers.get("content-type")?.startsWith("text/html")) console.warn(this.hash, `[${url.hostname}] Invalid response type - ${response.headers.get("content-type")}`);
      else this.saveMetadata(Buffer.from(await response.arrayBuffer()), url.hostname).catch(console.error);
    } catch (e) {
      console.warn(this.hash, `[${url.hostname}] An error occurred`, (e as Error).cause);
    }
  }
}
