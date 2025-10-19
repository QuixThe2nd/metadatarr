import type Torrent from "../classes/Torrent";
import { selectorEngine } from "../classes/SelectorEngine";
import { CONFIG } from "../config";
import type { SortConfigSchema } from "../schemas";
import type z from "zod";
import type Client from "../clients/client";

const getInitialTorrents = (torrents: Torrent[]): Torrent[] => torrents
  .filter(torrent => torrent.priority > 0)
  // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort config.
  .sort((a, b) => a.hash.localeCompare(b.hash));

const getCurrentPositions = (torrents: Torrent[]): string[] => [...torrents].sort((a, b) => a.priority - b.priority).map(t => t.hash);
const getDesiredPositions = (torrents: Torrent[], methods: z.infer<typeof SortConfigSchema>['METHODS']): string[] => methods.reduce((torrents, sort) => selectorEngine.execute(torrents, sort, false), torrents).map(t => t.hash);

const handleApiCall = async (client: Client, desiredPositions: string[], desiredPosition: number, config: z.infer<typeof SortConfigSchema>): Promise<void> => {
  await client.topPriority(desiredPositions.slice(0, desiredPosition + 1));
  if (config.MOVE_DELAY > 0) await new Promise(res => setTimeout(res, config.MOVE_DELAY));
};

const limitReached = (config: z.infer<typeof SortConfigSchema>, moves: number, calls: number): boolean => (
  (config.MAX_API_CALLS_PER_CYCLE !== 0 && calls >= config.MAX_API_CALLS_PER_CYCLE) ||
  (config.MAX_MOVES_PER_CYCLE !== 0 && moves >= config.MAX_MOVES_PER_CYCLE && calls >= config.MIN_API_CALLS_PER_CYCLE)
)

export const sort = async (torrents: Torrent[], client: Client, config = CONFIG.SORT()): Promise<{ changes: number }> => {
  if (!config.SORT) return { changes: 0 };

  torrents = getInitialTorrents(torrents);

  let currentPositions = getCurrentPositions(torrents);
  const desiredPositions = getDesiredPositions(torrents, config.METHODS);

  let changes = 0;
  let calls = 0;
  for (const [desiredPosition, hash] of desiredPositions.entries()) {
    const currentPosition = currentPositions.indexOf(hash);
    if (currentPosition === desiredPosition) continue;

    const shouldSkipApiCall = currentPositions[currentPosition+1] === desiredPositions[desiredPosition+1];
    currentPositions = currentPositions.toSpliced(currentPosition, 1).toSpliced(desiredPosition, 0, hash);

    if (!shouldSkipApiCall) {
      await handleApiCall(client, desiredPositions, desiredPosition, config);
      calls++;
    }
    changes++;

    if (limitReached(config, changes, calls)) break;
  }

  console.log(`Sorted ${torrents.length} torrents - Moved: ${changes} - API Calls: ${calls}`);
  return { changes };
}
