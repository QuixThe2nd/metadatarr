import { type SortMethods, CONFIG } from "../config";
import type Qbittorrent from "../services/qBittorrent";
import type { Torrent } from "../services/qBittorrent";

type Direction = "ASC" | "DESC";

export class SortEngine {
  private static strategies = {
    SIZE: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.size),
    COMPLETED: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.completed ?? 0),
    PROGRESS: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.progress),
    REMAINING: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.amount_left ?? 0),
    PRIVATE: (torrents: Torrent[], direction: Direction) => this.booleanSort(torrents, direction, t => t.private),
    NAME_CONTAINS: (torrents: Torrent[], direction: Direction, search: String) => this.booleanSort(torrents, direction, t => t.name.toLowerCase().includes(search.toLowerCase())),
    TAGS: (torrents: Torrent[], direction: Direction, tags: string[]) => this.booleanSort(torrents, direction, t => tags.some(tag => t.tags.split(", ").includes(tag))),
    NO_METADATA: (torrents: Torrent[], direction: Direction) => this.booleanSort(torrents, direction, t => t.size <= 0),
    PRIORITY_TAG: (torrents: Torrent[], direction: Direction, prefix: string) => this.numericSort(torrents, direction, t => {
      const priority = Number(t.tags.split(", ").find(tag => tag.startsWith(prefix))?.replace(prefix, ''))
      return Number.isNaN(priority) ? 50 : priority;
    }),
    CATEGORIES: (torrents: Torrent[], direction: Direction, categories: string[]) => this.booleanSort(torrents, direction, t => categories.includes(t.category ?? "")),
    PROGRESS_THRESHOLD: (torrents: Torrent[], direction: Direction, threshold: number) => this.booleanSort(torrents, direction, t => t.progress > threshold),
  }

  static sort(torrents: Torrent[], sortMethod: SortMethods): Torrent[] {
    if (sortMethod.key === 'NAME_CONTAINS') return this.strategies.NAME_CONTAINS(torrents, sortMethod.direction, sortMethod.searchString);
    else if (sortMethod.key === 'TAGS') return this.strategies.TAGS(torrents, sortMethod.direction, sortMethod.tags);
    else if (sortMethod.key === 'PRIORITY_TAG') return this.strategies.PRIORITY_TAG(torrents, sortMethod.direction, sortMethod.prefix);
    else if (sortMethod.key === 'CATEGORIES') return this.strategies.CATEGORIES(torrents, sortMethod.direction, sortMethod.categories);
    else if (sortMethod.key === 'PROGRESS_THRESHOLD') return this.strategies.PROGRESS_THRESHOLD(torrents, sortMethod.direction, sortMethod.threshold);
    else return this.strategies[sortMethod.key](torrents, sortMethod.direction);
  }

  private static numericSort(torrents: Torrent[], direction: Direction, getValue: (t: Torrent) => number) {
    const multiplier = direction === "DESC" ? -1 : 1;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * multiplier);
  }

  private static booleanSort(torrents: Torrent[], direction: Direction, getValue: (t: Torrent) => boolean | null) {
    const multiplier = direction === "DESC" ? -1 : 1;
    return [...torrents].sort((a, b) => {
      return (this.getNumericValue(getValue(a)) - this.getNumericValue(getValue(b))) * multiplier;
    });
  }

  private static getNumericValue = (val: boolean | null): number => val === false ? 0 : val === null ? 1 : 2;
}

export default class Sort {
  private readonly config = CONFIG.SORT();

  private constructor(private readonly api: Qbittorrent, private readonly torrents: Torrent[]) {}

  static async run(api: Qbittorrent, torrents: Torrent[]) {
    const sort = new Sort(api, torrents);
    return await sort.sortTorrents();
  }

  private async sortTorrents() {
    if (!this.config.SORT) return 0;
    let moves = 0;
    try {
      let torrents = this.torrents
        .filter(torrent => torrent.priority > 0)
        // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort this.config.
        .sort((a, b) => a.hash.localeCompare(b.hash));

      for (const sort of this.config.METHODS) torrents = SortEngine.sort(torrents, sort);
      let checkingTorrents = torrents.filter(torrent => torrent.state === "checkingUP" || torrent.state === "checkingDL");
      for (const sort of this.config.CHECKING_METHODS) checkingTorrents = SortEngine.sort(checkingTorrents, sort);
      let movingTorrents = torrents.filter(torrent => torrent.state === "moving");
      for (const sort of this.config.MOVING_METHODS) movingTorrents = SortEngine.sort(movingTorrents, sort);
      const activeTorrents = torrents.filter(torrent => torrent.state !== "checkingUP" && torrent.state !== "checkingDL" && torrent.state !== "moving");
      torrents = [...activeTorrents, ...movingTorrents, ...checkingTorrents].sort((a, b) => {
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
          if (shouldSkipApiCall) {
            // console.log(torrent.hash, `\x1b[32m[qBittorrent]\x1b[0m [SORT] ${type} Skipping redundant move`, torrent.name);
          } else {
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
    return moves;
  }
}