import z from "zod";
import type Torrent from "./Torrent";

const BaseSelectorSchema = z.object({ direction: z.enum(["ASC", "DESC"]) });

export const SelectorSchema = z.union([
  BaseSelectorSchema.extend({ key: z.enum(["SIZE", "COMPLETED", "PRIVATE", "PROGRESS", "NO_METADATA", "REMAINING"]) }),
  BaseSelectorSchema.extend({ key: z.literal("NAME_CONTAINS"), searchString: z.string().min(1) }),
  BaseSelectorSchema.extend({ key: z.literal("TAGS"), tags: z.array(z.string().min(1)).min(1) }),
  BaseSelectorSchema.extend({ key: z.literal("CATEGORIES"), categories: z.array(z.string().min(1)).min(1) }),
  BaseSelectorSchema.extend({ key: z.literal("PRIORITY_TAG"), prefix: z.string().min(1) }),
  BaseSelectorSchema.extend({ key: z.literal("PROGRESS_THRESHOLD"), threshold: z.number().min(0).max(1) }),
  BaseSelectorSchema.extend({ key: z.literal("STATES"), states: z.array(z.string()).min(1) }),
  BaseSelectorSchema.extend({ key: z.literal("SEQ_DL") }),
]);
export type Selector = z.infer<typeof SelectorSchema>;

type Direction = "ASC" | "DESC";
type Mode = 'SORT' | 'MATCH';

export class SelectorEngine {
  private static strategies = {
    SIZE: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.size),
    COMPLETED: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.completed ?? 0),
    PROGRESS: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.progress),
    REMAINING: (torrents: Torrent[], direction: Direction) => this.numericSort(torrents, direction, t => t.amount_left ?? 0),
    PRIVATE: (torrents: Torrent[], direction: Direction, mode: Mode) => this.booleanSort(torrents, direction, mode, t => t.private),
    NAME_CONTAINS: (torrents: Torrent[], direction: Direction, mode: Mode, search: String) => this.booleanSort(torrents, direction, mode, t => t.name.toLowerCase().includes(search.toLowerCase())),
    TAGS: (torrents: Torrent[], direction: Direction, mode: Mode, tags: string[]) => this.booleanSort(torrents, direction, mode, t => tags.some(tag => t.tags.split(", ").includes(tag))),
    NO_METADATA: (torrents: Torrent[], direction: Direction, mode: Mode) => this.booleanSort(torrents, direction, mode, t => t.size <= 0),
    SEQ_DL: (torrents: Torrent[], direction: Direction, mode: Mode) => this.booleanSort(torrents, direction, mode, t => t.seq_dl),
    CATEGORIES: (torrents: Torrent[], direction: Direction, mode: Mode, categories: string[]) => this.booleanSort(torrents, direction, mode, t => categories.includes(t.category ?? "")),
    STATES: (torrents: Torrent[], direction: Direction, mode: Mode, states: string[]) => this.booleanSort(torrents, direction, mode, t => states.includes(t.state ?? "")),
    PROGRESS_THRESHOLD: (torrents: Torrent[], direction: Direction, mode: Mode, threshold: number) => this.booleanSort(torrents, direction, mode, t => t.progress > threshold),
    PRIORITY_TAG: (torrents: Torrent[], direction: Direction, prefix: string) => this.numericSort(torrents, direction, t => {
      const priority = Number(t.tags.split(", ").find(tag => tag.startsWith(prefix))?.replace(prefix, ''))
      return Number.isNaN(priority) ? 50 : priority;
    }),
  }

  static execute(torrents: Torrent[], sortMethod: Selector, mode: Mode): Torrent[] {
    if (sortMethod.key === 'NAME_CONTAINS') return this.strategies.NAME_CONTAINS(torrents, sortMethod.direction, mode, sortMethod.searchString);
    else if (sortMethod.key === 'TAGS') return this.strategies.TAGS(torrents, sortMethod.direction, mode, sortMethod.tags);
    else if (sortMethod.key === 'PRIORITY_TAG') return this.strategies.PRIORITY_TAG(torrents, sortMethod.direction, sortMethod.prefix);
    else if (sortMethod.key === 'CATEGORIES') return this.strategies.CATEGORIES(torrents, sortMethod.direction, mode, sortMethod.categories);
    else if (sortMethod.key === 'STATES') return this.strategies.STATES(torrents, sortMethod.direction, mode, sortMethod.states);
    else if (sortMethod.key === 'PROGRESS_THRESHOLD') return this.strategies.PROGRESS_THRESHOLD(torrents, sortMethod.direction, mode, sortMethod.threshold);
    else return this.strategies[sortMethod.key](torrents, sortMethod.direction, mode);
  }

  private static numericSort(torrents: Torrent[], direction: Direction, getValue: (t: Torrent) => number) {
    const multiplier = direction === "DESC" ? -1 : 1;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * multiplier);
  }

  private static booleanSort(torrents: Torrent[], direction: Direction, mode: Mode, getValue: (t: Torrent) => boolean | null) {
    if (mode === 'MATCH') {
      const targetValue = direction === 'DESC' ? true : false;
      return torrents.filter(t => getValue(t) === targetValue);
    } else {
      const multiplier = direction === "DESC" ? -1 : 1;
      return [...torrents].sort((a, b) => (this.getNumericValue(getValue(a)) - this.getNumericValue(getValue(b))) * multiplier);
    }
  }

  private static getNumericValue = (val: boolean | null): number => val === false ? 0 : val === null ? 1 : 2;
}
