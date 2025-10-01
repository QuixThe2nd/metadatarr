import fs from 'fs';
import path from "path";
import { CONFIG } from "../config";
import parseTorrent from 'parse-torrent';

export default class OriginalNames {
  public readonly names: Record<string, string> = {};

  private constructor(readonly dir = CONFIG.NAMING().TORRENTS_DIR) {}

  static async start(): Promise<{ names: Record<string, string> }> {
    const originalNames = new OriginalNames();
    if (!originalNames.dir.length) return { names: {} };
    await originalNames.scanDirectory();
    fs.watch(originalNames.dir, (_, filename) => {
      if (filename) originalNames.saveName(originalNames.dir, filename);
    });
    return originalNames;
  }

  private async scanDirectory() {
    console.log('Scanning torrent name directory');
    const files = fs.readdirSync(this.dir)
    const totalFiles = files.length;
    let lastLoggedPercent = 0;

    console.log('Loading cache');
    const cache = fs.existsSync('./store/original_names.json') ? JSON.parse(fs.readFileSync('./store/original_names.json').toString()) as Record<string, { hash: string; name: string }> : {};

    console.log(`Scan: 0% complete (0 of ${totalFiles})`)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file in cache) {
        this.names[cache[file]!.hash!] = cache[file]!.name;
        continue;
      }
      const res = await this.saveName(this.dir, file);
      if (!res) continue;
      cache[file] = res;
      const currentPercent = Math.floor((i + 1) / totalFiles * 100);
      if (currentPercent > lastLoggedPercent && currentPercent % 5 === 0) {
        console.log(`Scan: ${currentPercent}% complete (${i + 1} of ${totalFiles})`);
        lastLoggedPercent = currentPercent;
      }
    }
    fs.writeFileSync('./store/original_names.json', JSON.stringify(cache))
    console.log('Scanned torrent name directory');
  }

  private async saveName(dir: string, file: string): Promise<false | { name: string; hash: string }> {
    if (!file.endsWith('.torrent')) return false;
    const filePath = path.join(dir, file);
    const torrent = fs.readFileSync(filePath);
    try {
      const metadata = await parseTorrent(torrent);
      this.names[metadata.infoHash!] = metadata.name as string;
      return { name: metadata.name as string, hash: metadata.infoHash! }
    } catch (e) {
      console.error(e, torrent.toString().slice(0, 100))
    }
  }
}