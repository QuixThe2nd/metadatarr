import type Qbittorrent from "../classes/qBittorrent";
import type Torrent from "../classes/Torrent";
import { selectorEngine } from "../classes/SelectorEngine";
import { CONFIG } from "../config";
import type { SortConfigSchema } from "../schemas";
import type z from "zod";

const getInitialTorrents = (torrents: Torrent[]): Torrent[] => torrents
  .filter(torrent => torrent.priority > 0)
  // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort config.
  .sort((a, b) => a.hash.localeCompare(b.hash));

const getCurrentPositions = (torrents: Torrent[]): string[] => [...torrents].sort((a, b) => a.priority - b.priority).map(t => t.hash);
const getDesiredPositions = (torrents: Torrent[], methods: z.infer<typeof SortConfigSchema>['METHODS']): string[] => methods.reduce((torrents, sort) => selectorEngine.execute(torrents, sort, false), torrents).map(t => t.hash);

const handleApiCall = async (api: Qbittorrent, desiredPositions: string[], desiredPosition: number, config: z.infer<typeof SortConfigSchema>): Promise<void> => {
  await api.topPriority(desiredPositions.slice(0, desiredPosition + 1));
  if (config.MOVE_DELAY > 0) await new Promise(res => setTimeout(res, config.MOVE_DELAY));
};

const limitReached = (config: z.infer<typeof SortConfigSchema>, moves: number, calls: number): boolean => (
  (config.MAX_API_CALLS_PER_CYCLE !== 0 && calls >= config.MAX_API_CALLS_PER_CYCLE) ||
  (config.MAX_MOVES_PER_CYCLE !== 0 && moves >= config.MAX_MOVES_PER_CYCLE && calls >= config.MIN_API_CALLS_PER_CYCLE)
)

export const sort = async (torrents: Torrent[], api: Qbittorrent, config = CONFIG.SORT()): Promise<number> => {
  if (!config.SORT) return 0;

  torrents = getInitialTorrents(torrents);

  let currentPositions = getCurrentPositions(torrents);
  const desiredPositions = getDesiredPositions(torrents, config.METHODS);

  let moves = 0;
  let calls = 0;
  for (const [desiredPosition, hash] of desiredPositions.entries()) {
    const currentPosition = currentPositions.indexOf(hash);
    if (currentPosition === desiredPosition) continue;

    const shouldSkipApiCall = currentPositions[currentPosition+1] === desiredPositions[desiredPosition+1];
    currentPositions = currentPositions.toSpliced(currentPosition, 1).toSpliced(desiredPosition, 0, hash);

    if (!shouldSkipApiCall) {
      await handleApiCall(api, desiredPositions, desiredPosition, config);
      calls++;
    }
    moves++;

    if (limitReached(config, moves, calls)) break;
  }

  console.log(`Sorted ${torrents.length} torrents - Moved: ${moves} - API Calls: ${calls}`);
  return moves;
}
