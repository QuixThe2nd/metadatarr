import { CONFIG } from "../config";
import Torrent from "../classes/Torrent";
import { SelectorEngine } from "../classes/SelectorEngine";

export default class Duplicates {
  private readonly config = CONFIG.DUPLICATES();
  public readonly torrents: Torrent[];

  private constructor(torrents: Torrent[]) {
    if (this.config.DOWNLOADS_ONLY) torrents = torrents.filter(torrent => ["stoppedDL", "stalledDL", "queuedDL", "checkingDL", "downloading", "metaDL", "forcedDL"].includes(torrent.state))
    if (this.config.IGNORE_TAG) torrents = torrents.filter(torrent => !torrent.tags.includes(this.config.IGNORE_TAG))

    if (this.config.PREFER_UPLOADING) torrents = torrents.sort((a, b) => {
      const AUploading = ["stalledUP", "checkingUP", "queuedUP", "stoppedUP", "uploading", "forcedUP"].includes(a.state);
      const BUploading = ["stalledUP", "checkingUP", "queuedUP", "stoppedUP", "uploading", "forcedUP"].includes(b.state);

      if (AUploading && !BUploading) return -1;
      if (!AUploading && BUploading) return 1;
      return 0;
    });
    for (const sort of this.config.TIE_BREAKERS) torrents = SelectorEngine.execute(torrents, sort, 'SORT');

    this.torrents = torrents;
  }

  static async run(torrents: Torrent[]) {
    const deduplicate = new Duplicates(torrents);
    const keptTorrents = new Map<string, Torrent>();
    let changes = 0;
    for (const torrent of deduplicate.torrents) {
      if (!keptTorrents.has(torrent.name)) keptTorrents.set(torrent.name, torrent);
      else {
        await torrent.delete();
        changes++;
      }
    }
    return changes;
  }
}