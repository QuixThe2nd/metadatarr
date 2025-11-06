import fs from 'fs';
import path from "path";
import { CONFIG } from "../config";
import parseTorrent from 'parse-torrent';

export default class OriginalNames {
  public readonly names: Record<string, string> = {};

  constructor(private readonly dir = CONFIG.NAMING().TORRENTS_DIR) {
    const cache = fs.existsSync('./store/original_names.json') ? JSON.parse(fs.readFileSync('./store/original_names.json').toString()) as Record<string, { hash: string; name: string }> : {};
    for (const {hash, name} of Object.values(cache)) this.names[hash] = name;

    if (!dir.length) return;
    this.scanDirectory(cache).catch(console.error)
    fs.watch(dir, (_, filename) => {
      if (filename !== null) this.saveName(dir, filename).catch(console.error);
    });
  }

  private async scanDirectory(cache: Record<string, { hash: string; name: string }>): Promise<void>{
    console.log('Scanning torrent name directory');
    const files = fs.readdirSync(this.dir)
    const totalFiles = files.length;
    let lastLoggedPercent = 0;

    console.log(`Scan: 0% complete (0 of ${totalFiles})`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file === undefined || cache[file]) continue;
      const res = await this.saveName(this.dir, file);
      if (res === false) continue;
      cache[file] = res;
      const currentPercent = Math.floor((i + 1) / totalFiles * 100);
      if (currentPercent > lastLoggedPercent && currentPercent % 5 === 0) {
        console.log(`Scan: ${currentPercent}% complete (${i + 1} of ${totalFiles})`);
        lastLoggedPercent = currentPercent;
      }
    }
    fs.writeFileSync('./store/original_names.json', JSON.stringify(cache));
    console.log(`Scan: 100% complete (${totalFiles} of ${totalFiles})`);
    console.log('Scanned torrent name directory');
  }

  private async saveName(dir: string, file: string): Promise<false | { name: string; hash: string }> {
    if (!file.endsWith('.torrent')) return false;
    const filePath = path.join(dir, file);
    const torrent = fs.readFileSync(filePath);
    if (torrent.length === 0) return false;
    try {
      // eslint-disable-next-line
      const metadata = await parseTorrent(torrent);
      if (metadata.infoHash === undefined) return false;
      this.names[metadata.infoHash] = metadata.name as string;
      return { name: metadata.name as string, hash: metadata.infoHash }
    } catch (e) {
      console.error(e, torrent.toString().slice(0, 100))
      return false;
    }
  }
}