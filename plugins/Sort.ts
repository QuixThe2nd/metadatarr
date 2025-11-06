import type Torrent from "../src/classes/Torrent";
import { selectorEngine } from "../src/classes/SelectorEngine";
import { CONFIG } from "../src/config";
import type { Instruction, SortConfigSchema } from "../src/schemas";
import type z from "zod";

const getInitialTorrents = (torrents: ReturnType<typeof Torrent>[]): ReturnType<typeof Torrent>[] => torrents
  .filter(torrent => torrent.get().priority > 0)
  // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort config.
  .sort((a, b) => a.get().hash.localeCompare(b.get().hash));

const getCurrentPositions = (torrents: ReturnType<typeof Torrent>[]): string[] => [...torrents].sort((a, b) => a.get().priority - b.get().priority).map(t => t.get().hash);
const getDesiredPositions = (torrents: ReturnType<typeof Torrent>[], methods: z.infer<typeof SortConfigSchema>['METHODS']): string[] => methods.reduce((torrents, sort) => selectorEngine.execute(torrents, sort, false), torrents).map(t => t.get().hash);

const limitReached = (config: z.infer<typeof SortConfigSchema>, moves: number, calls: number): boolean => (
  (config.MAX_API_CALLS_PER_CYCLE !== 0 && calls >= config.MAX_API_CALLS_PER_CYCLE) ||
  (config.MAX_MOVES_PER_CYCLE !== 0 && moves >= config.MAX_MOVES_PER_CYCLE && calls >= config.MIN_API_CALLS_PER_CYCLE)
)

const Sort = (torrents: ReturnType<typeof Torrent>[], config = CONFIG.SORT()): Instruction[] => {
  if (!config.ENABLED) return [];

  torrents = getInitialTorrents(torrents);

  let currentPositions = getCurrentPositions(torrents);
  const desiredPositions = getDesiredPositions(torrents, config.METHODS);

  let changes = 0;
  const instructions: Instruction[] = [];
  for (const [desiredPosition, hash] of desiredPositions.entries()) {
    const currentPosition = currentPositions.indexOf(hash);
    if (currentPosition === desiredPosition) continue;

    const shouldSkipApiCall = currentPositions[currentPosition+1] === desiredPositions[desiredPosition+1];
    currentPositions = currentPositions.toSpliced(currentPosition, 1).toSpliced(desiredPosition, 0, hash);

    if (!shouldSkipApiCall) instructions.push({ then: 'topPriority', arg: desiredPositions.slice(0, desiredPosition + 1) });
    changes++;

    if (limitReached(config, changes, instructions.length)) break;
  }

  return instructions;
}
export default Sort;
