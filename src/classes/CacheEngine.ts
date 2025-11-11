import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LockFile from './LockFile';
import SuperJSON from 'superjson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../../store/cache/');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

export class CacheEngine<K, V> implements Map<K, V> {
  private map = new Map<K, V>();
  private path: string;

  constructor({ name }: { name: string }) {
    const cachePath = path.join(cacheDir, `${name}.json`);
    new LockFile(`${cachePath}.lock`);
    this.path = cachePath;
    if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '[]', 'utf8');
    this.map = new Map<K, V>(JSON.parse(fs.readFileSync(cachePath, 'utf8')));
  }

  // Read
  get = (key: K): V | undefined => { return this.map.get(key) };
  forEach = (callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any) => { return this.map.forEach(callbackfn, thisArg) };
  has = (key: K): boolean => { return this.map.has(key) };
  entries = () => { return this.map.entries() };
  keys = () => { return this.map.keys() };
  values = () => { return this.map.values() };
  get size(): number { return this.map.size };

  // Write
  delete(key: K): boolean {
    const status = this.map.delete(key);
    fs.writeFileSync(this.path, JSON.stringify([...this.map]), 'utf8');
    return status;
  }
  clear(): void {
    this.map.clear();
    fs.writeFileSync(this.path, JSON.stringify([...this.map]), 'utf8');
  }
  set(key: K, value: V): this {
    this.map.set(key, value)
    fs.writeFileSync(this.path, JSON.stringify([...this.map]), 'utf8');
    return this;
  }

  // Iterator
  get [Symbol.iterator]() {
    return this.map[Symbol.iterator].bind(this.map);
  }
  get [Symbol.toStringTag]() {
    return 'FSMap';
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
