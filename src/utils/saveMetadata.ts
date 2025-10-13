import type { Instance } from "webtorrent";
import parseTorrent from 'parse-torrent';
import type Qbittorrent from "../classes/qBittorrent";
import Torrent from '../classes/Torrent';

export const saveMetadata = async (webtorrent: Instance, qB: Qbittorrent, metadata: Buffer): Promise<void> => {
  // eslint-disable-next-line
  const hash = (await parseTorrent(metadata)).infoHash!;
  await Torrent.add(qB, metadata);
  if (await webtorrent.get(hash)) {
    await webtorrent.remove(hash);
    console.log(hash, '\x1b[34m[WebTorrent]\x1b[0m Killed');
  }
}