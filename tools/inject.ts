import Qbittorrent from "../src/clients/qBittorrent";
import type Torrent from "../src/classes/Torrent";

const hook = async () => {
  const qB = await Qbittorrent.connect();
  console.log(qB);

  return async (torrents: Torrent[]): Promise<number> => {
    for (const torrent of torrents) 
      console.log(torrent.tracker)

    await new Promise(res => setTimeout(res, 10_000))
    return 0;
  }
}

export default hook;
