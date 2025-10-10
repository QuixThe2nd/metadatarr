import z from "zod";
import Torrent from "./Torrent";
import { TorrentSchema } from "./Torrent";
import type { SomeType } from "zod/v4/core";

type Direction = "ASC" | "DESC";
type Mode = 'SORT' | 'MATCH';

type TypedKeysOf<Z extends SomeType, T> = {
  [K in keyof T]: T[K] extends Z ? K :
  T[K] extends z.ZodNullable<Z> ? K :
  never;
}[keyof T];

const properties = <T extends z.ZodNumber | z.ZodString | z.ZodBoolean | z.ZodEnum<any> | z.ZodCodec<any>>(ctor: new (...args: any[]) => T) => Object.entries(TorrentSchema.shape)
  .filter(([, value]) => {
    const def = (value as any)._def;
    return value instanceof ctor
    || (value instanceof z.ZodNullable && value.unwrap() instanceof ctor)
    || (value instanceof z.ZodEnum && ctor === z.ZodEnum as any)
    || (def?.typeName === 'ZodPipeline' && def.out && def.out instanceof ctor);
  })
  .map(([key]) => key) as TypedKeysOf<T, typeof TorrentSchema.shape>[];

  TorrentSchema.shape.state.enum

const stringProperties = [...properties(z.ZodString), ...properties(z.ZodEnum)];
const numberProperties = properties(z.ZodNumber);
const booleanProperties = properties(z.ZodBoolean);
const arrayProperties = properties(z.ZodCodec);

const isBooleanProperty = (key: string): key is typeof booleanProperties[number] => booleanProperties.includes(key as typeof booleanProperties[number]);
const isStringProperty = (key: string): key is typeof stringProperties[number] => stringProperties.includes(key as typeof stringProperties[number]);
const isNumberProperty = (key: string): key is typeof numberProperties[number] => numberProperties.includes(key as typeof numberProperties[number]);
const isArrayProperty = (key: string): key is typeof arrayProperties[number] => arrayProperties.includes(key as typeof arrayProperties[number]);

const BaseSelectorSchema = z.object({ direction: z.enum(["ASC", "DESC"]) });

export const SelectorSchema = z.union([
  BaseSelectorSchema.extend({ key: z.enum(numberProperties), threshold: z.number().optional() }),
  BaseSelectorSchema.extend({ key: z.enum(stringProperties), includes: z.array(z.string().min(1)).min(1) }),
  BaseSelectorSchema.extend({ key: z.enum(arrayProperties), includes: z.array(z.string().min(1)).min(1) }),
  BaseSelectorSchema.extend({ key: z.enum(booleanProperties) }),
  BaseSelectorSchema.extend({ key: z.literal("priority_tag"), prefix: z.string().min(1) }),
]);
export type Selector = z.infer<typeof SelectorSchema>;

// console.log(stringProperties, numberProperties, booleanProperties);
// process.exit()

export class SelectorEngine {
  private static strategies = {
    PRIORITY_TAG: (torrents: Torrent[], direction: Direction, prefix: string) => this.numericSort(torrents, direction, t => {
      const priority = Number(t.tags.find(tag => tag.startsWith(prefix))?.replace(prefix, ''))
      return Number.isNaN(priority) ? 50 : priority;
    }),
  }

  static execute(torrents: Torrent[], query: Selector, mode: Mode): Torrent[] {
    const { key } = query;
    if (isBooleanProperty(key)) return this.booleanSort(torrents, query.direction, mode, t => t[key]);
    else if (isStringProperty(query.key) && key === query.key) return this.booleanSort(torrents, query.direction, mode, t => query.includes.some(q => t.name.toLowerCase().includes(q.toLowerCase())));
    else if (isArrayProperty(query.key) && key === query.key) return this.booleanSort(torrents, query.direction, mode, t => query.includes.some(q => t[key].includes(q)));
    else if (isNumberProperty(query.key) && key === query.key) {
      const threshold = query.threshold;
      return threshold === undefined
        ? this.numericSort(torrents, query.direction, t => t.size)
        : this.booleanSort(torrents, query.direction, mode, t => t.size >= threshold);
    } else throw new Error('Unexpected key???');
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
