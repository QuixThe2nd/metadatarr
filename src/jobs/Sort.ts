import { type SortMethods, CONFIG } from "../config";
import type Qbittorrent from "../services/qBittorrent";
import type { Torrent } from "../services/qBittorrent";

export default class Sort {
  private readonly config = CONFIG.SORT();

  private constructor(private readonly api: Qbittorrent, private readonly torrents: Torrent[]) {}

  static async run(api: Qbittorrent, torrents: Torrent[]) {
    const sort = new Sort(api, torrents);
    await sort.sortTorrents();
    return sort;
  }

  static sortMethod(torrents: Torrent[], sort: SortMethods) {
    const multiplier = sort.direction === "DESC" ? -1 : 1;
    if (sort.key === "SIZE") return torrents.sort((a, b) => (a.size - b.size)*multiplier);
    else if (sort.key === "COMPLETED") return torrents.sort((a, b) => ((a.completed ?? 0) - (b.completed ?? 0))*multiplier);
    else if (sort.key === "PROGRESS") return torrents.sort((a, b) => ((a.progress ?? 0) - (b.progress ?? 0))*multiplier);
    else if (sort.key === "REMAINING") return torrents.sort((a, b) => ((a.amount_left ?? 0) - (b.amount_left ?? 0))*multiplier);
    else if (sort.key === "PRIVATE") return torrents.sort((a, b) => {
      const getValue = (val: boolean | null): number => val === false ? 0 : val === null ? 1 : 2;
      return (getValue(a.private) - getValue(b.private))*multiplier;
    }); else if (sort.key === "PRIORITY_TAG") return torrents.sort((a, b) => {
      const tagA = Number(a.tags.split(", ").find(tag => tag.startsWith(sort.prefix))?.replace(sort.prefix, ''))
      const tagB = Number(b.tags.split(", ").find(tag => tag.startsWith(sort.prefix))?.replace(sort.prefix, ''))
      return ((Number.isNaN(tagA) ? 50 : tagA) - (Number.isNaN(tagB) ? 50 : tagB))*multiplier;
    }); else if (sort.key === "NAME_CONTAINS") return torrents.sort((a, b) => {
      const getValue = (val: boolean): number => val === false ? 0 : val === null ? 1 : 2;
      return (getValue(a.name.toLowerCase().includes(sort.searchString.toLowerCase())) - getValue(b.name.toLowerCase().includes(sort.searchString.toLowerCase())))*multiplier;
    }); else if (sort.key === "CATEGORIES") return torrents.sort((a, b) => {
      const aHasCategory = sort.categories.includes(a.category ?? "");
      const bHasCategory = sort.categories.includes(b.category ?? "");
      if (aHasCategory && !bHasCategory) return -1*multiplier;
      if (!aHasCategory && bHasCategory) return 1*multiplier;
      return 0;
    }); else if (sort.key === "TAGS") return torrents.sort((a, b) => {
      const aHasTag = a.tags.split(", ").filter(item => sort.tags.includes(item)).length !== 0;
      const bHasTag = b.tags.split(", ").filter(item => sort.tags.includes(item)).length !== 0;
      if (aHasTag && !bHasTag) return -1*multiplier;
      if (!aHasTag && bHasTag) return 1*multiplier;
      return 0;
    }); else if (sort.key === "NO_METADATA") return torrents.sort((a, b) => {
      if (a.size <= 0 && b.size > 0) return -1*multiplier;
      if (a.size > 0 && b.size <= 0) return 1*multiplier;
      return 0;
    }); else if (sort.key === "PROGRESS_THRESHOLD") return torrents.sort((a, b) => {
      const getValue = (val: number): number => val > sort.threshold ? 1 : 0;
      return (getValue(a.progress) - getValue(b.progress))*multiplier;
    });
    console.error('Unknown sort key');
    return torrents;
  }

  private async sortTorrents() {
    if (!this.config.SORT) return;
    let moves = 0;
    try {
      let torrents = this.torrents
        .filter(torrent => torrent.priority > 0)
        // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort this.config.
        .sort((a, b) => a.hash.localeCompare(b.hash));

      for (const sort of this.config.METHODS) torrents = Sort.sortMethod(torrents, sort);
      let checkingTorrents = torrents.filter(torrent => torrent.state === "checkingUP" || torrent.state === "checkingDL");
      for (const sort of this.config.CHECKING_METHODS) checkingTorrents = Sort.sortMethod(checkingTorrents, sort);
      let movingTorrents = torrents.filter(torrent => torrent.state === "moving");
      for (const sort of this.config.MOVING_METHODS) movingTorrents = Sort.sortMethod(movingTorrents, sort);
      const activeTorrents = torrents.filter(torrent => torrent.state !== "checkingUP" && torrent.state !== "checkingDL" && torrent.state !== "moving");
      torrents = [...movingTorrents, ...activeTorrents, ...checkingTorrents].sort((a, b) => {
        const aStopped = a.state.startsWith('stopped') ? 1 : 0;
        const bStopped = b.state.startsWith('stopped') ? 1 : 0;
        return (aStopped - bStopped)*this.config.MOVE_STOPPED;
      });

      console.log(`\x1b[32m[qBittorrent]\x1b[0m [SORT] Sorting ${torrents.length} torrents`);

      let positionTracker = [...torrents].sort((a, b) => a.priority - b.priority).map(torrent => torrent.hash);

      let api_moves = 0;
      const processedTorrents: string[] = [];
      while (processedTorrents.length < positionTracker.length) {
        const torrent = torrents[processedTorrents.length]!;
        processedTorrents.push(torrent.hash);

        const current_priority = positionTracker.indexOf(torrent.hash) + 1;
        const new_priority = processedTorrents.length
        positionTracker = [...processedTorrents, ...positionTracker.filter(torrent => !processedTorrents.includes(torrent))];
        if (current_priority !== new_priority) {
          const nextTorrent = torrents[processedTorrents.length];
          const shouldSkipApiCall = nextTorrent && current_priority && positionTracker.indexOf(nextTorrent.hash) === current_priority;

          const type = checkingTorrents.find(t => t.hash === torrent.hash) ? '[CHECKING]' : (movingTorrents.find(t => t.hash === torrent.hash) ? '[MOVING]' : '[ACTIVE]');
          if (shouldSkipApiCall) console.log(torrent.hash, `\x1b[32m[qBittorrent]\x1b[0m [SORT] ${type} Skipping redundant move`, torrent.name);
          else {
            await this.api.topPriority(processedTorrents);
            api_moves++;

            if (this.config.MOVE_DELAY > 0) await new Promise(res => setTimeout(res, this.config.MOVE_DELAY));
            if (this.config.PERSISTENT_MOVES) break;
          }
          moves++;

          if (this.config.RESORT_STEP_CALLS !== 0 && api_moves >= this.config.RESORT_STEP_CALLS) {
            console.log(`\x1b[32m[qBittorrent]\x1b[0m [SORT] Stepping sort`);
            break;
          } else if (this.config.RESORT_STEP !== 0 && moves >= this.config.RESORT_STEP && api_moves >= this.config.RESORT_STEP_MINIMUM_CALLS) {
            console.log(`\x1b[32m[qBittorrent]\x1b[0m [SORT] Stepping sort`);
            break;
          }
        }
      }

      console.log(`\x1b[32m[qBittorrent]\x1b[0m [SORT] Sorted ${torrents.length} torrents - Moved: ${moves} - API Calls: ${api_moves}`);
    } catch (e) {
      console.error(e)
    }
  }
}