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
    const def = value._def;
    return value instanceof ctor
    || (value instanceof z.ZodNullable && value.unwrap() instanceof ctor)
    || (value instanceof z.ZodEnum && ctor === z.ZodEnum as any)
    || (def?.typeName === 'ZodPipeline' && def.out && def.out instanceof ctor);
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
type Property = BooleanProperty | StringProperty | NumberProperty | ArrayProperty;

const isBooleanProperty = (key: Property): key is BooleanProperty => booleanProperties.includes(key as BooleanProperty);
const isStringProperty = (key: Property): key is StringProperty => stringProperties.includes(key as StringProperty);
const isNumberProperty = (key: Property): key is NumberProperty => numberProperties.includes(key as NumberProperty);
const isArrayProperty = (key: Property): key is ArrayProperty => arrayProperties.includes(key as ArrayProperty);

const booleanComparators = z.enum(["==", "!="]);
const numericComparators = z.enum([">=", ">", "<", "<="]);
const orderComparators = z.enum(["ASC", "DESC"]);
const booleanSelectorSchema = z.object({ comparator: booleanComparators });
const numberSortSchema = z.object({ comparator: orderComparators });
const coercedBooleanSelectorSchema = z.object({ comparator: z.union([numericComparators, booleanComparators]) });

const baseSelectorSchema = z.union([
  numberSortSchema.extend({ key: z.enum(numberProperties) }),
  booleanSelectorSchema.extend({ key: z.enum(booleanProperties) }),
  coercedBooleanSelectorSchema.extend({ key: z.enum(numberProperties), threshold: z.number() }),
  coercedBooleanSelectorSchema.extend({ key: z.union([z.enum(stringProperties), z.enum(arrayProperties)]), includes: z.array(z.string().min(1)).min(1) }),
  // BaseSelectorSchema.extend({ key: z.literal("priority_tag"), prefix: z.string().min(1) }),
]);
export const SelectorSchema = baseSelectorSchema.and(z.object({ else: z.array(baseSelectorSchema) }).partial())
export type Selector = z.infer<typeof SelectorSchema>;

const compare = (a: number | boolean, b: number | boolean, comparator: z.infer<typeof numericComparators> | z.infer<typeof booleanComparators>): boolean => {
  switch (comparator) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
    default: throw new Error(`Unknown comparator: ${comparator}`);
  }
};

const booleanSort = (torrents: Torrent[], getValue: (t: Torrent) => boolean): Torrent[] => [...torrents].sort((a, b) => {
  const aValue = getValue(a);
  return aValue === getValue(b) ? 0 : aValue ? -1 : 1;
});

export const selectorEngine = {
  execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    const startCount = torrents.length;
    torrents = this._execute(torrents, query, filter);
    if (!filter && torrents.length !== startCount) throw new Error(`SOMETHING WENT VERY WRONG SORTING - Some torrents got omitted? Inputted ${startCount} - Outputted ${torrents.length}`);
    return torrents;
  },
  _execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    torrents = isBooleanProperty(query.key) ? this.processBoolean(torrents, query as Selector & { key: BooleanProperty }, filter) :
      isStringProperty(query.key) ? this.processString(torrents, query as Selector & { key: StringProperty }, filter) :
      isArrayProperty(query.key) ? this.processArray(torrents, query as Selector & { key: ArrayProperty }, filter) :
      isNumberProperty(query.key) ? this.processNumber(torrents, query as Selector & { key: NumberProperty }, filter) : [];

    if (!query.else || filter) return torrents;
    const elseQueries = query.else;
    const matches = this.execute(torrents, query, true);
    let elseTorrents = torrents.filter(t => !matches.includes(t));
    for (const elseQuery of elseQueries) elseTorrents = this.execute(elseTorrents, elseQuery, false);
    return [...matches, ...elseTorrents];
  },
  processBoolean(torrents: Torrent[], query: Selector & { key: BooleanProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => query.comparator === '==' ? t[query.key] ?? false : !(t[query.key] ?? false);
    return filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);
  },
  processString(torrents: Torrent[], query: Selector & { key: StringProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => compare(query.includes.some(q => t[query.key]?.toLowerCase().includes(q.toLowerCase()) ?? false), true, query.comparator);
    return filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);
  },
  processArray(torrents: Torrent[], query: Selector & { key: ArrayProperty }, filter: boolean): Torrent[] {
    const getValue = (t: Torrent): boolean => compare(query.includes.some(q => t[query.key].includes(q)), true, query.comparator);
    return filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);
  },
  processNumber(torrents: Torrent[], query: Selector & { key: NumberProperty }, filter: boolean): Torrent[] {
    if ('threshold' in query) {
      const getValue = (t: Torrent): boolean => compare(t[query.key] ?? 0, query.threshold, query.comparator);
      return filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);
    }
    const getValue = (t: Torrent): number => t[query.key] ?? 0;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * (query.comparator === 'ASC' ? 1 : -1));
  }
}
