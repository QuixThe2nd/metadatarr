import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LockFile from './LockFile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cacheDir = path.join(__dirname, '../../store/cache/');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);

export class CacheEngine<K extends string, V> {
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
    if (+new Date() > rawValue.expiry) {
      this.map.delete(key);
      return undefined;
    }
    return rawValue.value;
  };

  // Write
  set(key: K, value: V | undefined, lifespan: number): this {
    if (value === undefined) this.map.delete(key);
    else this.map.set(key, { value, expiry: +new Date() + lifespan })
    fs.writeFileSync(this.path, JSON.stringify([...this.map]), 'utf8');
    return this;
  }
}
