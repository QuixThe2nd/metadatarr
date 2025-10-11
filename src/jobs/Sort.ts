import { CONFIG } from "../config";
import type Qbittorrent from "../classes/qBittorrent";
import type Torrent from "../classes/Torrent";
import { selectorEngine } from "../classes/SelectorEngine";

const shouldStop = (maxMoves: number, maxCalls: number, minCalls: number, moves: number, calls: number): boolean => (
  (maxCalls !== 0 && calls >= maxCalls) ||
  (maxMoves !== 0 && moves >= maxMoves && calls >= minCalls)
)

export const sort = async (api: Qbittorrent, torrents: Torrent[]): Promise<number> => {
  const config = CONFIG.SORT();

  if (!config.SORT) return 0;
  let moves = 0;

  torrents = torrents
    .filter(torrent => torrent.priority > 0)
    // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort config.
    .sort((a, b) => a.hash.localeCompare(b.hash));

  let currentPositions = [...torrents].sort((a, b) => a.priority - b.priority).map(t => t.hash);
  const desiredPositions = config.METHODS.reduce((torrents, sort) => selectorEngine.execute(torrents, sort, false), torrents).map(t => t.hash);

  let calls = 0;
  for (const [desiredPosition, hash] of desiredPositions.entries()) {
    const currentPosition = currentPositions.indexOf(hash);
    if (currentPosition === desiredPosition) continue;

    const shouldSkipApiCall = currentPositions[currentPosition+1] === desiredPositions[desiredPosition+1];
    currentPositions = currentPositions.toSpliced(currentPosition, 1).toSpliced(desiredPosition, 0, hash);

    if (!shouldSkipApiCall) {
      await api.topPriority(desiredPositions.slice(0, desiredPosition + 1));
      calls++;
      if (config.MOVE_DELAY > 0) await new Promise(res => setTimeout(res, config.MOVE_DELAY));
    }
    moves++;

    if (shouldStop(config.MAX_MOVES_PER_CYCLE, config.MAX_API_CALLS_PER_CYCLE, config.MIN_API_CALLS_PER_CYCLE, moves, calls)) break;
  }

  console.log(`Sorted ${torrents.length} torrents - Moved: ${moves} - API Calls: ${calls}`);
  return moves;
}
