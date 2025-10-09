import type { Instance } from "webtorrent";
import FetchMetadata from "../helpers/FetchMetadata";
import Torrent from "../classes/Torrent";

export default class Metadata {
  private constructor() {}

  static async run(torrents: Torrent[], webtorrent: Instance, saveMetadata: (hash: string, metadata: Buffer, source: string) => Promise<void>) {
    for (const torrent of torrents) {
      if (torrent.size <= 0) await new FetchMetadata(webtorrent, torrent, saveMetadata).state;
    }
    return 0;
  }
}