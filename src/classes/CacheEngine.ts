import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LockFile from './LockFile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../../store/cache/');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

export class CacheEngine<K extends string, V> implements Map<K, V | undefined> {
  private map = new Map<K, { value: V; expiry: number }>();
  private path: string;

  constructor({ name }: { name: string }) {
    const cachePath = path.join(cacheDir, `${name}.json`);
    new LockFile(`${cachePath}.lock`);
    this.path = cachePath;
    if (!fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '[]', 'utf8');
    this.map = new Map<K, { value: V; expiry: number }>(JSON.parse(fs.readFileSync(cachePath, 'utf8')));
  }

  // Read
  get = (key: K): V | undefined => { 
    const rawValue = this.map.get(key);
    if (rawValue === undefined) return undefined;
    return rawValue.value;
  };
  forEach = (callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void => { this.map.forEach((v, k, m) => {
    callbackfn(v.value, k, new Map(m.entries().map(([k, v]) => [k, v.value])));
  }, thisArg) };
  has = (key: K): boolean => { return this.map.has(key) };
  entries = (): MapIterator<[K, V]> => { return this.map.entries().map(([k, v]) => [k, v.value]) };
  keys = (): MapIterator<K> => { return this.map.keys() };
  values = (): MapIterator<V> => { return this.map.values().map(v => v.value) };
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
  set(key: K, value: V | undefined, lifespan: number): this {
    this.map.set(key, { value, expiry: +new Date() + lifespan })
    fs.writeFileSync(this.path, JSON.stringify([...this.map]), 'utf8');
    return this;
  }

  // Iterator
  get [Symbol.iterator]() {
    return this.map[Symbol.iterator].bind(this.map);
  }
  get [Symbol.toStringTag](): string {
    return 'CacheEngine';
  }
}

// TODO: actually use cache expiry