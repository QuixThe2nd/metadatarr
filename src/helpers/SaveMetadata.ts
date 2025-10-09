import fs from 'fs';
import path from 'path';
import type { Instance } from "webtorrent";
import parseTorrent from 'parse-torrent';
import { CONFIG } from "../config";
import type Qbittorrent from "../classes/qBittorrent";
import Torrent from '../classes/Torrent';

export default class SaveMetadata {
  constructor(private readonly qB: Qbittorrent, private readonly webtorrent: Instance, private readonly torrentPath = CONFIG.METADATA().TORRENT_PATH) {}

  async save(hash: string, metadata: Buffer, source: string) {
    await parseTorrent(metadata);
    if (!await Torrent.add(this.qB, metadata)) fs.writeFileSync(path.join(this.torrentPath, `/${hash}_${source}.torrent`), metadata);
    if (await this.webtorrent.get(hash)) {
      await this.webtorrent.remove(hash);
      console.log(hash, '\x1b[34m[WebTorrent]\x1b[0m Killed');
    }
  }
}