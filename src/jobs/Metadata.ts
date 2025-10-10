import type { Instance } from "webtorrent";
import FetchMetadata from "../helpers/FetchMetadata";
import Torrent from "../classes/Torrent";

const metadata = async (torrents: Torrent[], webtorrent: Instance, saveMetadata: (metadata: Buffer, source: string) => Promise<void>) => {
  for (const torrent of torrents) {
    if (torrent.size <= 0) await new FetchMetadata(webtorrent, torrent, saveMetadata).state;
  }
  return 0;
}
export default metadata;
