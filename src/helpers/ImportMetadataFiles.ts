import fs from 'fs';
import { CONFIG } from "../config";
import parseTorrent from 'parse-torrent';

export default class ImportMetadataFiles {
  private constructor(private readonly saveMetadata: (hash: string, metadata: Buffer, source: string) => Promise<void>, private readonly dir = CONFIG.METADATA().TORRENT_PATH) {}

  static async start(saveMetadata: (hash: string, metadata: Buffer, source: string) => Promise<void>) {
    const importMetadata = new ImportMetadataFiles(saveMetadata);
    await importMetadata.scan();
    return importMetadata;
  }

  async scan() {
    console.log(`Scanning torrent metadata directory`);
    console.log('Scanning torrent import directory');
    for (const file of fs.readdirSync(this.dir)) await this.importFile(this.dir, file);
    console.log('Scanned torrent directory');

    fs.watch(this.dir, (_, filename) => {
      if (filename) this.importFile(this.dir, filename).catch(console.error);
    });
    console.log('Scanned torrent import directories');
  }

  async importFile(dir: string, file: string) {
    if (!file.endsWith('.torrent')) return;
    const torrentFile = fs.readFileSync(dir + "/" + file);
    try {
      const metadata = await parseTorrent(torrentFile);
      await this.saveMetadata(metadata.infoHash!, torrentFile, 'Local');
    } catch (e) {
      console.error(e);
    }
  }
}
