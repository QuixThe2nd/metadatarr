import z from "zod";
import type Torrent from "./Torrent";
import { TorrentSchema } from "./Torrent";
import type { SomeType } from "zod/v4/core";

type TypedKeysOf<Z extends SomeType, T> = {
  [K in keyof T]: T[K] extends Z ? K :
  T[K] extends z.ZodNullable<Z> ? K :
  never;
}[keyof T];

const properties = <T extends z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodEnum | z.ZodCodec>(ctor: new (...args: unknown[]) => T): TypedKeysOf<T, typeof TorrentSchema.shape>[] => Object.entries(TorrentSchema.shape)
  .filter(([, value]) => {
    return value instanceof ctor
    || (value instanceof z.ZodNullable && value.unwrap() instanceof ctor)
    || value instanceof z.ZodEnum;
  })
  .map(([key]) => key) as TypedKeysOf<T, typeof TorrentSchema.shape>[];

const stringProperties = [...properties(z.ZodString), ...properties(z.ZodEnum)];
const numberProperties = properties(z.ZodNumber);
const booleanProperties = properties(z.ZodBoolean);
const arrayProperties = properties(z.ZodCodec);

type StringProperty = typeof stringProperties[number];
type NumberProperty = typeof numberProperties[number];
type BooleanProperty = typeof booleanProperties[number];
type ArrayProperty = typeof arrayProperties[number];

const isBooleanProperty = (key: string): key is BooleanProperty => booleanProperties.includes(key as BooleanProperty);
const isStringProperty = (key: string): key is StringProperty => stringProperties.includes(key as StringProperty);
const isNumberProperty = (key: string): key is NumberProperty => numberProperties.includes(key as NumberProperty);
const isArrayProperty = (key: string): key is ArrayProperty => arrayProperties.includes(key as ArrayProperty);

const booleanComparators = z.enum(["==", "!="]);
const booleanSelectorSchema = z.object({ comparator: booleanComparators });
const numberSortSchema = z.object({ comparator: z.enum(["ASC", "DESC"]) });
const numericComparators = z.enum([">=", ">", "<", "<="]);
type Comparators = z.infer<typeof numericComparators> | z.infer<typeof booleanComparators>;
const coercedBooleanSelectorSchema = z.object({ comparator: z.union([numericComparators, booleanComparators]) });

export const SelectorSchema = z.union([
  numberSortSchema.extend({ key: z.enum(numberProperties) }),
  coercedBooleanSelectorSchema.extend({ key: z.enum(numberProperties), threshold: z.number() }),
  coercedBooleanSelectorSchema.extend({ key: z.union([z.enum(stringProperties), z.enum(arrayProperties)]), includes: z.array(z.string().min(1)).min(1) }),
  booleanSelectorSchema.extend({ key: z.enum(booleanProperties) }),
  // BaseSelectorSchema.extend({ key: z.literal("priority_tag"), prefix: z.string().min(1) }),
]);
export type Selector = z.infer<typeof SelectorSchema>;

export const selectorEngine = {
  compare(a: number | boolean, b: number | boolean, comparator: Comparators): boolean {
    switch (comparator) {
      case '>': return a > b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '==': return a === b;
      case '!=': return a !== b;
      default: throw new Error(`Unknown comparator: ${comparator}`);
    }
  },
  execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    const startCount = torrents.length;
    torrents = this._execute(torrents, query, filter);
    if (!filter && torrents.length !== startCount) throw new Error(`SOMETHING WENT VERY WRONG SORTING - Some torrents got omitted? Inputted ${startCount} - Outputted ${torrents.length}`);
    return torrents;
  },
  _execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    if (isBooleanProperty(query.key)) return this.processBoolean(torrents, query as Selector & { key: BooleanProperty }, filter);
    else if (isStringProperty(query.key)) return this.processString(torrents, query as Selector & { key: StringProperty }, filter);
    else if (isArrayProperty(query.key)) return this.processArray(torrents, query as Selector & { key: ArrayProperty }, filter);
    else if (isNumberProperty(query.key)) return this.processNumber(torrents, query as Selector & { key: NumberProperty }, filter);
    throw new Error(`Unexpected key: ${query.key}`);
  },
  processBoolean(torrents: Torrent[], query: Selector & { key: BooleanProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => t[query.key] ?? false;
    if (filter) return torrents.filter(t => this.compare(getValue(t), true, query.comparator))
    return [...torrents].sort((a, b) => this.compare(getValue(a), getValue(b), query.comparator) ? 1 : -1);
  },
  processString(torrents: Torrent[], query: Selector & { key: StringProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => this.compare(query.includes.some(q => t[query.key]?.toLowerCase().includes(q.toLowerCase()) ?? false), true, query.comparator);
    if (filter) return torrents.filter(t => this.compare(getValue(t), true, query.comparator))
    return [...torrents].sort((a, b) => {
      const aValue = getValue(a);
      return (aValue === getValue(b)) ? 0 : aValue ? -1 : 1;
    });
  },
  processArray(torrents: Torrent[], query: Selector & { key: ArrayProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => this.compare(query.includes.some(q => t[query.key].includes(q)), true, query.comparator);
    if (filter) return torrents.filter(t => this.compare(getValue(t), true, query.comparator))
    return [...torrents].sort((a, b) => this.compare(getValue(a), getValue(b), query.comparator) ? 1 : -1);
  },
  processNumber(torrents: Torrent[], query: Selector & { key: NumberProperty }, filter: boolean): Torrent[] {
    if ('threshold' in query) {
      const getValue = (t: Torrent): boolean => this.compare(t[query.key] ?? 0, query.threshold, query.comparator);
      if (filter) return torrents.filter(t => getValue(t));
      return [...torrents].sort((a, b) => {
        const aValue = getValue(a);
        return (aValue === getValue(b)) ? 0 : aValue ? -1 : 1;
      });
    }
    const getValue = (t: Torrent): number => t[query.key] ?? 0;
    const multiplier = ['ASC', '<', '<=', '=='].includes(query.comparator) ? 1 : -1;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * multiplier);
  }
}
