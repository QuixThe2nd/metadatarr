import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";
import type { Instruction } from "../Types";

const GB = 1024*1024*1024;

const getDownloadQueue = (torrents: ReturnType<typeof Torrent>[]): ReturnType<typeof Torrent>[] => torrents.filter(torrent => (torrent.get().state === 'downloading' || torrent.get().state === 'forcedDL' || torrent.get().state === 'queuedDL'));
const getTorrentsMoving = (torrents: ReturnType<typeof Torrent>[]): ReturnType<typeof Torrent>[] => torrents.filter(torrent => torrent.get().state === 'moving');

const getTotalSize = (torrents: ReturnType<typeof Torrent>[]): number => torrents.map(torrent => torrent.get().size).reduce((acc, curr) => acc + curr, 0);

export const Queue = (torrents: ReturnType<typeof Torrent>[]): Instruction[] => {
  const config = CONFIG.QUEUE();
  if (!config.QUEUE_SIZE_LIMIT) return [];

  torrents = torrents.filter(t => !config.EXCLUDE_CATEGORIES.includes(t.get().category ?? ''));

  let sizeLimit = config.QUEUE_SIZE_LIMIT*GB - (config.INCLUDE_MOVING_TORRENTS ? getTotalSize(getTorrentsMoving(torrents)) : 0);
  let queueSize = 0;
  for (const torrent of getDownloadQueue(torrents)) {
    if (torrent.get().size > sizeLimit) {
      if (!config.HARD_QUEUE_SIZE_LIMIT) queueSize++;
      break;
    }
    sizeLimit -= torrent.get().size;
    queueSize++;
  }

  return [{
    then: 'setMaxActiveDownloads',
    arg: Math.min(config.MAXIMUM_QUEUE_SIZE, Math.max(config.MINIMUM_QUEUE_SIZE, queueSize))
  }];
}
