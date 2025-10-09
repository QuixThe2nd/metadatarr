import Qbittorrent from "../src/classes/qBittorrent";
import type Torrent from "../src/classes/Torrent";

const hook = async () => {
  const qB = await Qbittorrent.connect();

  return async (torrents: Torrent[]): Promise<void> => {
    for (const torrent of torrents) {
    }

    await new Promise(res => setTimeout(res, 10_000))
  }
}

export default hook;
