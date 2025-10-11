import type Torrent from "../classes/Torrent";
import type Qbittorrent from '../classes/qBittorrent';
import { CONFIG } from "../config";

const GB = 1024*1024*1024;

const getDownloadQueue = (torrents: Torrent[]): Torrent[] => torrents.filter(torrent => (torrent.state === 'downloading' || torrent.state === 'forcedDL' || torrent.state === 'queuedDL'));
const getTorrentsMoving = (torrents: Torrent[]): Torrent[] => torrents.filter(torrent => torrent.state === 'moving');

const getTotalSize = (torrents: Torrent[]): number => torrents.map(torrent => torrent.size).reduce((acc, curr) => acc + curr, 0);

export const queue = async (api: Qbittorrent, torrents: Torrent[]): Promise<number> => {
  const config = CONFIG.QUEUE();
  if (!config.QUEUE_SIZE_LIMIT) return 0;

  torrents = torrents.filter(t => !config.EXCLUDE_CATEGORIES.includes(t.category ?? ''));

  let sizeLimit = config.QUEUE_SIZE_LIMIT*GB - (config.INCLUDE_MOVING_TORRENTS ? getTotalSize(getTorrentsMoving(torrents)) : 0);
  let queueSize = 0;
  for (const torrent of getDownloadQueue(torrents)) {
    if (torrent.size > sizeLimit) {
      if (!config.HARD_QUEUE_SIZE_LIMIT) queueSize++;
      break;
    }
    sizeLimit -= torrent.size;
    queueSize++;
  }

  const preferences = await api.getPreferences();
  if (preferences === false) return 0;

  const maxActiveDownloads = Math.min(config.MAXIMUM_QUEUE_SIZE, Math.max(config.MINIMUM_QUEUE_SIZE, queueSize));
  if (maxActiveDownloads !== preferences.max_active_downloads) {
    console.log(`\x1b[32m[qBittorrent]\x1b[0m Setting maximum active downloads to ${maxActiveDownloads}`);
    await api.setPreferences({ max_active_downloads: maxActiveDownloads });
    return 1;
  }
  return 0;
}
