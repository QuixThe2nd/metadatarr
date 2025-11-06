import type Torrent from "../classes/Torrent";
import type { MetadataSchema } from '../schemas';
import type { Instance } from 'webtorrent';
import { saveMetadata } from "../utils/saveMetadata";
import type z from "zod";
import { CONFIG } from "../config";
import type Client from '../clients/client';

const metadata = async (torrents: ReturnType<typeof Torrent>[], client: Client, webtorrent: Instance): Promise<[]> => {
  const fetchWebtorrent = async (hash: string, magnet_uri: string): Promise<void> => {
    if (await webtorrent.get(hash)) return;
    console.log(hash, "\x1b[34m[WebTorrent]\x1b[0m Fetching metadata");
    webtorrent.add(magnet_uri, { destroyStoreOnDestroy: false }, torrent => saveMetadata(webtorrent, client, torrent.torrentFile));
  }

  const fetchFromHTTP = async (hash: string, source: z.infer<typeof MetadataSchema>['sources'][number]): Promise<void> => {
    const url = new URL(`${source.url[0]}${hash}${source.url[1] ?? ''}`);
    try {
      console.log(hash, `\x1b[34m[${url.hostname}]\x1b[0m Fetching metadata`);
      const response = await fetch(url);
      if (response.status === 404) console.warn(hash, `[${url.hostname}] No metadata found`);
      else if (!response.ok) console.warn(hash, `[${url.hostname}] Failed to fetch metadata - ${response.status} ${response.statusText}`);
      else if (response.headers.get("content-type")?.startsWith("text/html") ?? false) console.warn(hash, `[${url.hostname}] Invalid response type - ${response.headers.get("content-type")}`);
      else saveMetadata(webtorrent, client, Buffer.from(await response.arrayBuffer())).catch(console.error);
    } catch (e) {
      console.warn(hash, `[${url.hostname}] An error occurred`, (e as Error).cause);
    }
  }

  const { sources } = CONFIG.METADATA();
  for (const torrent of torrents) 
    if (torrent.get().size <= 0) {
      console.log(torrent.get().hash, "Fetching metadata");
      await fetchWebtorrent(torrent.get().hash, torrent.get().magnet_uri);
      await Promise.all(sources.map(source => fetchFromHTTP(torrent.get().hash, source)));
    }
  
  return [];
}
export default metadata;
