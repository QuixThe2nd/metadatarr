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
    const def = value.def;
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

const typeGuard = <T extends Property>(arr: readonly T[], key: Property): key is T => arr.includes(key as T);

const booleanComparators = z.enum(["==", "!="]);
const numericComparators = z.enum([">=", ">", "<", "<="]);
const booleanSelectorSchema = z.object({ comparator: booleanComparators });
const numberSortSchema = z.object({ comparator: z.enum(["ASC", "DESC"]) });
const coercedBooleanSelectorSchema = z.object({ comparator: z.union([numericComparators, booleanComparators]) });

const baseSelectorSchema = z.union([
  numberSortSchema.extend({ key: z.enum(numberProperties) }),
  booleanSelectorSchema.extend({ key: z.enum(booleanProperties) }),
  coercedBooleanSelectorSchema.extend({
    key: z.enum(numberProperties),
    value: z.number()
  }),
  coercedBooleanSelectorSchema.extend({
    key: z.union([z.enum(stringProperties), z.enum(arrayProperties)]),
    value: z.array(z.string().min(1)).min(1)
  }),
  // BaseSelectorSchema.extend({ key: z.literal("priority_tag"), prefix: z.string().min(1) }),
]);

type Selector = z.infer<typeof baseSelectorSchema> & {
  then?: Selector[] | undefined;
  else?: Selector[] | undefined;
};

export const SelectorSchema: z.ZodType<Selector> = z.lazy(() =>
  baseSelectorSchema
    .and(z.object({ then: z.array(SelectorSchema) }).partial())
    .and(z.object({ else: z.array(SelectorSchema) }).partial())
);

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

const booleanSort = (torrents: Torrent[], getValue: (t: Torrent) => boolean): Torrent[] => [...torrents].sort((a, b) => +getValue(b) - +getValue(a));

const process = (torrents: Torrent[], filter: boolean, getValue: (t: Torrent) => boolean): Torrent[] => filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);

export const selectorEngine = {
  execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    const startCount = torrents.length;
    torrents = this._execute(torrents, query, filter);
    if (!filter && torrents.length !== startCount) throw new Error(`SOMETHING WENT VERY WRONG SORTING - Some torrents got omitted? Inputted ${startCount} - Outputted ${torrents.length}`);
    return torrents;
  },
  _execute(torrents: Torrent[], query: Selector, filter: boolean): Torrent[] {
    torrents = typeGuard(booleanProperties, query.key) ? this.processBoolean(torrents, query as Selector & { key: BooleanProperty }, filter) :
      typeGuard(stringProperties, query.key) ? this.processString(torrents, query as Selector & { key: StringProperty }, filter) :
      typeGuard(arrayProperties, query.key) ? this.processArray(torrents, query as Selector & { key: ArrayProperty }, filter) :
      typeGuard(numberProperties, query.key) ? this.processNumber(torrents, query as Selector & { key: NumberProperty }, filter) : [];

    if (!filter && (query.then || query.else)) {
      const thenTorrents = this.execute(torrents, query, true);
      const elseTorrents = torrents.filter(t => !thenTorrents.includes(t));
      return [
        ...(query.then ?? []).reduce((torrents, thenQuery) => this.execute(torrents, thenQuery, false), thenTorrents),
        ...(query.else ?? []).reduce((torrents, elseQuery) => this.execute(torrents, elseQuery, false), elseTorrents)
      ];
    }
    return torrents;
  },
  processBoolean: (torrents: Torrent[], query: Selector & { key: BooleanProperty }, filter: boolean): Torrent[] => process(torrents, filter, t => query.comparator === '==' ? t[query.key] ?? false : !(t[query.key] ?? false)),
  processString: (torrents: Torrent[], query: Selector & { key: StringProperty }, filter: boolean): Torrent[] => process(torrents, filter, t => compare(query.value.some(q => t[query.key]?.toLowerCase().includes(q.toLowerCase()) ?? false), true, query.comparator)),
  processArray: (torrents: Torrent[], query: Selector & { key: ArrayProperty }, filter: boolean): Torrent[] => process(torrents, filter, t => compare(query.value.some(q => t[query.key].includes(q)), true, query.comparator)),
  processNumber(torrents: Torrent[], query: Selector & { key: NumberProperty }, filter: boolean): Torrent[] {
    if ('value' in query) return process(torrents, filter, t => compare(t[query.key] ?? 0, query.value, query.comparator));
    const getValue = (t: Torrent): number => t[query.key] ?? 0;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * (query.comparator === 'ASC' ? 1 : -1));
  }
}
