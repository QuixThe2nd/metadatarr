import type { Torrent } from "../src/services/qBittorrent";

const inject = async (torrents: Torrent[]): Promise<void> => {
  console.log(torrents)

  await new Promise(res => setTimeout(res, 10_000))
}

export default inject;
