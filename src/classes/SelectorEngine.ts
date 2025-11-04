import z from "zod";
import type Torrent from "./Torrent";
import { properties } from "./Torrent";

const typedKeys = <T extends object>(obj: T): (keyof T)[] => Object.keys(obj) as (keyof T)[];

const StringKeys = typedKeys(properties.String);
const NumberKeys = typedKeys(properties.Number);
const BooleanKeys = typedKeys(properties.Boolean);
const ArrayKeys = typedKeys(properties.Array);

// Comparators
const BooleanComparators = z.enum(["==", "!="]);
const NumericComparators = z.enum([">=", ">", "<", "<="]);
const NumericSortComparators = z.enum(["ASC", "DESC"]);

// Comparator Schemas
const NumericComparatorSchema = z.object({ comparator: NumericSortComparators });
const BooleanComparatorSchema = z.object({ comparator: BooleanComparators });
const CoercedBooleanComparatorSchema = z.object({ comparator: z.union([NumericComparators, BooleanComparators]) });

const SelectorSchema = z.union([
  NumericComparatorSchema.extend({ key: z.enum(NumberKeys) }),
  BooleanComparatorSchema.extend({ key: z.enum(BooleanKeys) }),
  CoercedBooleanComparatorSchema.extend({
    key: z.enum(NumberKeys),
    value: z.number()
  }),
  CoercedBooleanComparatorSchema.extend({
    key: z.union([z.enum(StringKeys), z.enum(ArrayKeys)]),
    value: z.array(z.string().min(1)).min(1)
  }),
  // BaseSelectorSchema.extend({ key: z.literal("priority_tag"), prefix: z.string().min(1) }),
]);

type Query = z.infer<typeof SelectorSchema> & {
  then?: Query[] | undefined;
  else?: Query[] | undefined;
}

export const QuerySchema: z.ZodType<Query> = z.lazy(() =>
  SelectorSchema
    .and(z.object({ then: z.array(QuerySchema) }).partial())
    .and(z.object({ else: z.array(QuerySchema) }).partial())
);

type StringQuery = Query & { key: keyof typeof properties.String };
type NumberQuery = Query & { key: keyof typeof properties.Number };
type BooleanQuery = Query & { key: keyof typeof properties.Boolean };
type ArrayQuery = Query & { key: keyof typeof properties.Array };

const typeGuard = (query: Query): { string: StringQuery } | { number: NumberQuery } | { boolean: BooleanQuery } | { array: ArrayQuery } | Record<never, never> => {
  if (StringKeys.includes(query.key as typeof StringKeys[number])) return { string: query as StringQuery }
  if (NumberKeys.includes(query.key as typeof NumberKeys[number])) return { number: query as NumberQuery }
  if (BooleanKeys.includes(query.key as typeof BooleanKeys[number])) return { boolean: query as BooleanQuery }
  if (ArrayKeys.includes(query.key as typeof ArrayKeys[number])) return { array: query as ArrayQuery }
  return {};
}

const compare = (a: number | boolean, b: number | boolean, comparator: z.infer<typeof NumericComparators> | z.infer<typeof BooleanComparators>): boolean => {
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

const booleanSort = (torrents: ReturnType<typeof Torrent>[], getValue: (t: ReturnType<typeof Torrent>) => boolean): ReturnType<typeof Torrent>[] => [...torrents].sort((a, b) => +getValue(b) - +getValue(a));

const process = (torrents: ReturnType<typeof Torrent>[], filter: boolean, getValue: (t: ReturnType<typeof Torrent>) => boolean): ReturnType<typeof Torrent>[] => filter ? torrents.filter(getValue) : booleanSort(torrents, getValue);

export const selectorEngine = {
  execute(torrents: ReturnType<typeof Torrent>[], query: Query, filter: boolean): ReturnType<typeof Torrent>[] {
    const startCount = torrents.length;
    torrents = this._execute(torrents, query, filter);
    if (!filter && torrents.length !== startCount) throw new Error(`SOMETHING WENT VERY WRONG SORTING - Some torrents got omitted? Inputted ${startCount} - Outputted ${torrents.length}`);
    return torrents;
  },
  _execute(torrents: ReturnType<typeof Torrent>[], query: Query, filter: boolean): ReturnType<typeof Torrent>[] {
    const matches: ReturnType<typeof Torrent>[] = [];
    // for (const subquery of (Array.isArray(query) ? query : [query])) 
    const subquery = typeGuard(query);
      matches.push(...'boolean' in subquery ? this.processBoolean(torrents, subquery.boolean, filter) :
        'string' in subquery ? this.processString(torrents, subquery.string, filter) :
        'array' in subquery ? this.processArray(torrents, subquery.array, filter) :
        'number' in subquery ? this.processNumber(torrents, subquery.number, filter) : []);
    torrents = [...new Map(matches.map(t => [t.get().hash, t])).values()]

    if (!filter && (query.then || query.else)) return this.subExecute(torrents, query);
    return torrents;
  },
  subExecute(torrents: ReturnType<typeof Torrent>[], query: Query): ReturnType<typeof Torrent>[] {
    const thenTorrents = this.execute(torrents, query, true);
    const elseTorrents = torrents.filter(t => !thenTorrents.includes(t));
    return [
        ...(query.then ?? []).reduce((torrents, thenQuery) => this.execute(torrents, thenQuery, false), thenTorrents),
        ...(query.else ?? []).reduce((torrents, elseQuery) => this.execute(torrents, elseQuery, false), elseTorrents)
      ]
  },
  processBoolean: (torrents: ReturnType<typeof Torrent>[], query: BooleanQuery, filter: boolean): ReturnType<typeof Torrent>[] => process(torrents, filter, t => query.comparator === '==' ? t.get()[query.key] ?? false : !(t.get()[query.key] ?? false)),
  processString: (torrents: ReturnType<typeof Torrent>[], query: StringQuery, filter: boolean): ReturnType<typeof Torrent>[] => process(torrents, filter, t => compare(query.value.some(q => t.get()[query.key]?.toLowerCase().includes(q.toLowerCase()) ?? false), true, query.comparator)),
  processArray: (torrents: ReturnType<typeof Torrent>[], query: ArrayQuery, filter: boolean): ReturnType<typeof Torrent>[] => process(torrents, filter, t => compare(query.value.some(q => t.get()[query.key].includes(q)), true, query.comparator)),
  processNumber(torrents: ReturnType<typeof Torrent>[], query: NumberQuery, filter: boolean): ReturnType<typeof Torrent>[] {
    if ('value' in query) return process(torrents, filter, t => compare(t.get()[query.key] ?? 0, query.value, query.comparator));
    const getValue = (t: ReturnType<typeof Torrent>): number => t.get()[query.key] ?? 0;
    return [...torrents].sort((a, b) => (getValue(a) - getValue(b)) * (query.comparator === 'ASC' ? 1 : -1));
  }
}
