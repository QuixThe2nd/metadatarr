import { CONFIG } from "../config";
import type Qbittorrent from "../classes/qBittorrent";
import type Torrent from "../classes/Torrent";
import { SelectorEngine } from "../classes/SelectorEngine";

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

      for (const sort of this.config.METHODS) torrents = SelectorEngine.execute(torrents, sort, 'SORT');
      let checkingTorrents = torrents.filter(torrent => torrent.state === "checkingUP" || torrent.state === "checkingDL");
      for (const sort of this.config.CHECKING_METHODS) checkingTorrents = SelectorEngine.execute(checkingTorrents, sort, 'SORT');
      let movingTorrents = torrents.filter(torrent => torrent.state === "moving");
      for (const sort of this.config.MOVING_METHODS) movingTorrents = SelectorEngine.execute(movingTorrents, sort, 'SORT');
      const checkingResumeData = torrents.filter(torrent => torrent.state === "checkingResumeData");
      const activeTorrents = torrents.filter(torrent => torrent.state !== "checkingUP" && torrent.state !== "checkingDL" && torrent.state !== "moving" && torrent.state !== 'checkingResumeData');
      torrents = [...activeTorrents, ...movingTorrents, ...checkingTorrents, ...checkingResumeData];

      console.log(`Sorting ${torrents.length} torrents`);

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

          if (shouldSkipApiCall) {
            // const type = checkingTorrents.find(t => t.hash === torrent.hash) ? '[CHECKING]' : (movingTorrents.find(t => t.hash === torrent.hash) ? '[MOVING]' : '[ACTIVE]');
            // console.log(torrent.hash, `${type} Skipping redundant move`, torrent.name);
          } else {
            await this.api.topPriority(processedTorrents);
            api_moves++;

            if (this.config.MOVE_DELAY > 0) await new Promise(res => setTimeout(res, this.config.MOVE_DELAY));
            if (this.config.PERSISTENT_MOVES) break;
          }
          moves++;

          if (this.config.RESORT_STEP_CALLS !== 0 && api_moves >= this.config.RESORT_STEP_CALLS) {
            console.log(`Stepping sort`);
            break;
          } else if (this.config.RESORT_STEP !== 0 && moves >= this.config.RESORT_STEP && api_moves >= this.config.RESORT_STEP_MINIMUM_CALLS) {
            console.log(`Stepping sort`);
            break;
          }
        }
      }

      console.log(`Sorted ${torrents.length} torrents - Moved: ${moves} - API Calls: ${api_moves}`);
    } catch (e) {
      console.error(e)
    }
    return moves;
  }
}