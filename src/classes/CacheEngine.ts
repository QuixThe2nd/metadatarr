import fs from 'fs';
import z from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import LockFile from './LockFile';
import SuperJSON from 'superjson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cachePath = path.join(__dirname, '../../store/cache.json');

const ItemSchema = z.object({
  value: z.string(),
  expiry: z.number()
});
const StoreSchema = z.record(z.string(), ItemSchema);
type Store = z.infer<typeof StoreSchema>;

export class CacheEngine {
  private readonly store: Store;

  constructor(path = cachePath) {
    new LockFile(`${path}.lock`);
    this.store = StoreSchema.parse(fs.existsSync(path) ? JSON.parse(fs.readFileSync(path).toString()) : {});
  
  }

  set(key: string, value: string, ttl = 3_600_000): void {
    const expiry = Date.now() + ttl;
    this.store[key] = { value, expiry };
    fs.writeFileSync(cachePath, JSON.stringify(this.store));
  }

  get(key: string): string | null {
    const item = this.store[key];
    if (item === undefined) return null;
    if (Date.now() > item.expiry) {
      delete this.store[key];
      return null;
    }
    return item.value;
  }
}

export class CachedValue<T> {
  constructor(private readonly cacheEngine: CacheEngine, private readonly key: string, private readonly defaultValue: T, private readonly expiry: number) {}

  get value(): T {
    const rawValue = this.cacheEngine.get(this.key);
    if (rawValue === null) return this.defaultValue;
    return SuperJSON.parse(rawValue);
  }

  set value(value: T | null) {
    this.cacheEngine.set(this.key, SuperJSON.stringify(value), this.expiry);
  }
}

export const cacheEngine = new CacheEngine();