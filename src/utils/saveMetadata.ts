import fs from 'fs';
import path from 'path';
import type { Instance } from "webtorrent";
import parseTorrent from 'parse-torrent';
import { CONFIG } from "../config";
import type Qbittorrent from "../classes/qBittorrent";
import Torrent from '../classes/Torrent';

export const saveMetadata = async (webtorrent: Instance, qB: Qbittorrent, metadata: Buffer, source: string): Promise<void> => {
  const torrentPath = CONFIG.METADATA().TORRENT_PATH;
  // eslint-disable-next-line
  const hash = (await parseTorrent(metadata)).infoHash!;
  if (await Torrent.add(qB, metadata) === false) fs.writeFileSync(path.join(torrentPath, `/${hash}_${source}.torrent`), metadata);
  if (await webtorrent.get(hash)) {
    await webtorrent.remove(hash);
    console.log(hash, '\x1b[34m[WebTorrent]\x1b[0m Killed');
  }
}