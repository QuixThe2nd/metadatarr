import Qbittorrent from "../src/clients/qBittorrent";
import type Torrent from "../src/classes/Torrent";
import type { Instruction } from "../src/Types";

const hook = async () => {
  const qB = await Qbittorrent.connect();
  console.log(qB);

  return async (torrents: ReturnType<typeof Torrent>[]): Promise<Instruction[]> => {
    for (const torrent of torrents) 
      console.log(torrent.get().tracker)

    await new Promise(res => setTimeout(res, 10_000))
    return [];
  }
}

export default hook;
