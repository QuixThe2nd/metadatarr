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
      if (filename) originalNames.saveName(originalNames.dir, filename).catch(console.error);
    });
    return originalNames;
  }

  private async scanDirectory() {
    console.log('Scanning torrent name directory');
    const files = fs.readdirSync(this.dir)
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      await this.saveName(this.dir, file)
      if (i % 500 === 0) console.log(`Scan: ${i} of ${files.length} complete`);
    }
    console.log('Scanned torrent name directory');
  }

  private async saveName(dir: string, file: string) {
    const filePath = path.join(dir, file);
    const metadata = await parseTorrent(fs.readFileSync(filePath));
    this.names[metadata.infoHash!] = metadata.name as string;
  }
}