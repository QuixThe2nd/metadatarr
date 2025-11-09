import type Torrent from "../src/classes/Torrent";
import { QuerySchema, selectorEngine } from "../src/classes/SelectorEngine";
import type { Instruction } from "../src/schemas";
import z from "zod";
import type { HookInputs } from "../src/plugins";

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  MAX_MOVES_PER_CYCLE: z.number().int().nonnegative().default(500),
  MIN_API_CALLS_PER_CYCLE: z.number().int().nonnegative().default(2),
  MAX_API_CALLS_PER_CYCLE: z.number().int().nonnegative().default(200),
  METHODS: z.array(QuerySchema).default([
		/* Prefer smaller torrents
		ASC: Smallest first
		DESC: Largest first
		*/
		{"key": "size", "comparator": "ASC"},
		/* Prefer torrents with the most progress
		ASC: Least progress first
		DESC: Most progress first
		*/
		{"key": "progress", "comparator": "DESC"},
		/* Prefer torrents with the most completed data
		ASC: Least completed first
		DESC: Most completed first
		*/
		{"key": "completed", "comparator": "DESC"},
		/* Prefer torrents closest to completion
		ASC: Closest to finishing first
		DESC: Furthest from finishing first - This is useful if you want to prioritise starting new torrents over finishing existing ones
		*/
		{"key": "amount_left", "comparator": "ASC"},
		/* Prefer finishing private torrents
		ASC: Non-private first
		DESC: Private first
		*/
		{"key": "private", "comparator": "=="},
		/* Prefer torrents with specific tags
		ASC: Without tags first
		DESC: With tags first
		When specifying multiple tags, the order of tags does not matter. If you want to prioritise specific tags over others, use multiple sort entries.
		*/
		// { "key": "TAGS", "comparator": "DESC", "tags": ["@DP"] },
		// { "key": "TAGS", "comparator": "DESC", "tags": ["@MaM"] },
		/* Prefer finishing torrents whose name contains a specific string
		ASC: Contains last
		DESC: Contains first
		*/
		{"key": "name", "comparator": "==", "value": ["S01"]},
		/* Prefer torrents in specific categories
		ASC: Without categories first
		DESC: With categories first
		When specifying multiple categories, the order of categories does not matter. If you want to prioritise specific categories over others, use multiple sort entries.
		*/
		{"key": "category", "comparator": "==", "value": ["cross-seed-links"]},
		/* Prefer torrents that are almost finished
		ASC: Almost finished last
		DESC: Almost finished first
		value is a float between 0 and 1, representing the progress percentage.
		*/
		{"key": "progress", "comparator": ">=", "value": 0.1},
		{"key": "progress", "comparator": ">=", "value": 0.99},
		{"key": "state", "comparator": "!=", "value": ["stoppedDL", "stoppedUP"]},
		/* Prefer torrents without metadata
		ASC: Torrents with metadata first
		DESC: Torrents without metadata first
		By default, torrents without metadata are de-prioritised as they can't accurately be sorted by size or progress.
		It is recommended to leave this as-is, and let Metadatarr source torrents instead of qBittorrent.
		*/
		{"key": "size", "comparator": "!=", "value": 0},
		{
			"key": "state",
			"comparator": "!=",
			"value": ["checkingDL", "checkingUP"],
			"else": [
				{"key": "amount_left", "comparator": "ASC"},
				{"key": "state", "comparator": "==", "value": ["checkingDL"]}
			]
		}
	])
});

const getInitialTorrents = (torrents: ReturnType<typeof Torrent>[]): ReturnType<typeof Torrent>[] => torrents
  .filter(torrent => torrent.get().priority > 0)
  // This is needed to ensure sorts are consistent. Otherwise order could be different every run if 2 torrents have the same priority as defined by sort config.
  .sort((a, b) => a.get().hash.localeCompare(b.get().hash));

const getCurrentPositions = (torrents: ReturnType<typeof Torrent>[]): string[] => [...torrents].sort((a, b) => a.get().priority - b.get().priority).map(t => t.get().hash);
const getDesiredPositions = (torrents: ReturnType<typeof Torrent>[], methods: z.infer<typeof ConfigSchema>['METHODS']): string[] => methods.reduce((torrents, sort) => selectorEngine.execute(torrents, sort, false), torrents).map(t => t.get().hash);

const limitReached = (config: z.infer<typeof ConfigSchema>, moves: number, calls: number): boolean => (
  (config.MAX_API_CALLS_PER_CYCLE !== 0 && calls >= config.MAX_API_CALLS_PER_CYCLE) ||
  (config.MAX_MOVES_PER_CYCLE !== 0 && moves >= config.MAX_MOVES_PER_CYCLE && calls >= config.MIN_API_CALLS_PER_CYCLE)
)

export const hook = ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Instruction[] => {
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
