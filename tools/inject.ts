import type { Torrent } from "../src/services/qBittorrent";
import Qbittorrent from "../src/services/qBittorrent";

const hook = async () => {
  const qB = await Qbittorrent.connect();

  return async (torrents: Torrent[]): Promise<void> => {
    for (const torrent of torrents) {
    }

    await new Promise(res => setTimeout(res, 10_000))
  }
}

export default hook;
