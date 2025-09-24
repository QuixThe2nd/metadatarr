import { CONFIG } from "../config";
import type Qbittorrent from "../services/qBittorrent";
import type { Torrent } from "../services/qBittorrent";
import { SortEngine } from "./Sort";

export default class Duplicates {
  private readonly config = CONFIG.DUPLICATES();
  public readonly torrents: Torrent[];

  private constructor(torrents: Torrent[]) {
    if (this.config.DOWNLOADS_ONLY) torrents = torrents.filter(torrent => ["stoppedDL", "stalledDL", "queuedDL", "checkingDL", "downloading", "metaDL", "forcedDL"].includes(torrent.state))
    if (this.config.IGNORE_TAG) torrents = torrents.filter(torrent => !torrent.tags.split(', ').includes(this.config.IGNORE_TAG))

    if (this.config.PREFER_UPLOADING) torrents = torrents.sort((a, b) => {
      const AUploading = ["stalledUP", "checkingUP", "queuedUP", "stoppedUP", "uploading", "forcedUP"].includes(a.state);
      const BUploading = ["stalledUP", "checkingUP", "queuedUP", "stoppedUP", "uploading", "forcedUP"].includes(b.state);

      if (AUploading && !BUploading) return -1;
      if (!AUploading && BUploading) return 1;
      return 0;
    });
    for (const sort of this.config.TIE_BREAKERS) torrents = SortEngine.sort(torrents, sort);

    this.torrents = torrents;
  }

  static async run(api: Qbittorrent, torrents: Torrent[]) {
    console.log('Removing duplicate torrents');
    const deduplicate = new Duplicates(torrents);
    const keptTorrents = new Map<string, Torrent>();
    for (const torrent of deduplicate.torrents) {
      if (!keptTorrents.has(torrent.name)) keptTorrents.set(torrent.name, torrent);
      else await api.delete([torrent.hash]);
    }
    console.log('Done removing duplicate torrents');
    return deduplicate;
  }
}