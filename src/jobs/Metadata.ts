import type { Instance } from "webtorrent";
import FetchMetadata from "../helpers/FetchMetadata";
import type { Torrent } from "../services/qBittorrent";

export default class Metadata {
  private constructor() {}

  static async run(torrents: Torrent[], webtorrent: Instance, saveMetadata: (hash: string, metadata: Buffer, source: string) => Promise<void>) {
    console.log('Fetching metadata');
    const metadata = new Metadata();
    for (const torrent of torrents) {
      if (torrent.size <= 0) await new FetchMetadata(webtorrent, torrent, saveMetadata).state;
    }
    console.log('Fetched metadata');
    return metadata;
  }
}