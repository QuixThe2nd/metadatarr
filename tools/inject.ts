import Qbittorrent from "../src/classes/qBittorrent";
import type Torrent from "../src/classes/Torrent";

const hook = async () => {
  const qB = await Qbittorrent.connect();
  console.log(qB);

  return async (torrents: Torrent[]): Promise<void> => {
    for (const torrent of torrents) 
      console.log(torrent)
    

    await new Promise(res => setTimeout(res, 10_000))
  }
}

export default hook;
