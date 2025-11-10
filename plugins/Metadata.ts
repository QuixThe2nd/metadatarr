import z from "zod";
import WebTorrent from 'webtorrent';
import fs from 'fs';
import type { Instance } from 'webtorrent';
import type Client from '../src/clients/client';
import path from 'path';
import { fileURLToPath } from 'url';
import parseTorrent from 'parse-torrent';
import type { HookInputs } from "../src/plugins";

const safeParseTorrent = async (metadata: Buffer): Promise<string | false> => {
  try {
    // eslint-disable-next-line
    return (await parseTorrent(metadata)).infoHash!;
  } catch(e) {
    console.error('Failed to parse torrent metadata', e)
    console.log(metadata)
    console.log(metadata.toString().slice(0, 20))
    return false;
  }
}

export const saveMetadata = async (webtorrent: Instance, client: Client, metadata: Buffer): Promise<void> => {
  const hash = await safeParseTorrent(metadata);
  if (hash === false) return;
  await client.add(metadata);
  if (await webtorrent.get(hash)) {
    await webtorrent.remove(hash);
    console.log(hash, '\x1b[34m[WebTorrent]\x1b[0m Killed');
  }
}

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  TORRENT_PATH: z.string().min(1).default('"./store/torrents"'),
  sources: z.array(z.tuple([z.url(), z.string().optional()])).default([
    ["https://itorrents.org/torrent/", ".torrent"],
    ["https://btcache.me/torrent/"],
    ["https://hash2torrent.com/torrents/"],
    ["https://yts.mx/torrent/download/"],
    ["https://bitsearch.to/download/torrent/"]
	])
});
type Config = z.infer<typeof ConfigSchema>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const importFile = async (webtorrent: Instance, client: Client, dir: string, file: string): Promise<void> => {
  if (!file.endsWith('.torrent')) return;
  const torrentFile = fs.readFileSync(`${dir  }/${  file}`);
  try {
    await saveMetadata(webtorrent, client, torrentFile);
  } catch (e) {
    console.error(e);
  }
}

export const importMetadataFiles = async (webtorrent: Instance, client: Client, dir: string): Promise<void> => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  console.log(`Scanning torrent import directory`);
  for (const file of fs.readdirSync(dir)) await importFile(webtorrent, client, dir, file);

  fs.watch(dir, (_, filename) => {
    if (filename !== null) importFile(webtorrent, client, dir, filename).catch(console.error);
  });
  console.log('Scanned torrent import directory');
}


const webtorrent = new WebTorrent({ downloadLimit: 1024 });

let firstRun = true;
export const hook = async ({ torrents, client, config }: HookInputs<Config>): Promise<[]> => {
  if (!config.ENABLED) return [];
  if (firstRun) {
    await importMetadataFiles(webtorrent, client,  path.join(__dirname, '/../../', config.TORRENT_PATH))
    firstRun = false;
  }

  const fetchWebtorrent = async (hash: string, magnet_uri: string): Promise<void> => {
    if (await webtorrent.get(hash)) return;
    console.log(hash, "\x1b[34m[WebTorrent]\x1b[0m Fetching metadata");
    webtorrent.add(magnet_uri, { destroyStoreOnDestroy: false }, torrent => saveMetadata(webtorrent, client, torrent.torrentFile));
  }

  const fetchFromHTTP = async (hash: string, source: Config['sources'][number]): Promise<void> => {
    const url = new URL(`${source[0]}${hash}${source[1] ?? ''}`);
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

  for (const torrent of torrents) 
    if (torrent.get().size <= 0) {
      console.log(torrent.get().hash, "Fetching metadata");
      await fetchWebtorrent(torrent.get().hash, torrent.get().magnet_uri);
      await Promise.all(config.sources.map(source => fetchFromHTTP(torrent.get().hash, source)));
    }
  
  return [];
}
