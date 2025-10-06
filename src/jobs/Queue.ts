import { CONFIG } from "../config";
import type { Torrent } from "../services/qBittorrent";
import Qbittorrent from '../services/qBittorrent';

export default class Queue {
  private constructor(private readonly api: Qbittorrent, private readonly torrents: Torrent[], private readonly config = CONFIG.QUEUE()) {}

  static async run(api: Qbittorrent, torrents: Torrent[]) {
    console.log('Updating queue size');
    const queue = new Queue(api, torrents);
    const changed = await queue.update();
    console.log('Updated queue size');
    return changed;
  }

  async update() {
    if (this.config.QUEUE_SIZE_LIMIT) {
      const queuedTorrents = this.torrents.filter(torrent => torrent.state === 'queuedDL');
      const downloadingTorrents = this.torrents.filter(torrent => (torrent.state === 'downloading' || torrent.state === 'forcedDL') && !this.config.EXCLUDE_CATEGORIES.includes(torrent.category ?? ''));
      const relatedTorrents = [...queuedTorrents, ...downloadingTorrents];
      let downloadingSize = downloadingTorrents.map(torrent => torrent.size).reduce((acc, curr) => acc + curr, 0);
      if (this.config.INCLUDE_MOVING_TORRENTS) downloadingSize += this.torrents.filter(torrent => torrent.state === 'moving').map(torrent => torrent.size).reduce((acc, curr) => acc + curr, 0);

      const preferences = await this.api.getPreferences()
      if (!preferences) console.error('Failed to fetch preferences');
      else {
        let maxActiveDownloads = preferences.max_active_downloads;

        let i = downloadingTorrents.length;
        let increaseMaxActiveDownloads = true;
        let decreaseMaxActiveDownloads = true;
        while (increaseMaxActiveDownloads || decreaseMaxActiveDownloads) {
          const nextTorrent = relatedTorrents[i];
          const lastTorrent = relatedTorrents[i-1];
          increaseMaxActiveDownloads = (nextTorrent && downloadingSize + (this.config.HARD_QUEUE_SIZE_LIMIT ? nextTorrent.size : 0) < this.config.QUEUE_SIZE_LIMIT * 1024*1024*1024) ?? false;
          decreaseMaxActiveDownloads = (lastTorrent && downloadingSize - (this.config.HARD_QUEUE_SIZE_LIMIT ? 0 : lastTorrent.size) > this.config.QUEUE_SIZE_LIMIT * 1024*1024*1024) ?? false;
          if (increaseMaxActiveDownloads) {
            maxActiveDownloads++;
            downloadingSize += nextTorrent?.size ?? 0;
            i++;
          }
          if (decreaseMaxActiveDownloads) {
            maxActiveDownloads--;
            downloadingSize -= lastTorrent?.size ?? 0;
            i--;
          }
        }
        if (maxActiveDownloads < this.config.MINIMUM_QUEUE_SIZE) maxActiveDownloads = this.config.MINIMUM_QUEUE_SIZE;
        if (maxActiveDownloads > this.config.MAXIMUM_QUEUE_SIZE) maxActiveDownloads = this.config.MAXIMUM_QUEUE_SIZE;
        if (maxActiveDownloads < 1) maxActiveDownloads = 1;
        if (maxActiveDownloads !== preferences.max_active_downloads) {
          console.log(`\x1b[32m[qBittorrent]\x1b[0m Setting maximum active downloads to ${maxActiveDownloads}`);
          await this.api.setPreferences({ max_active_downloads: maxActiveDownloads });
          return 1;
        }
      }
    }
    return 0;
  }
}
