import fs from 'fs';
import { CONFIG } from "../config";

export default class ImportMetadataFiles {
  private constructor(private readonly saveMetadata: (metadata: Buffer, source: string) => Promise<void>, private readonly dir = CONFIG.METADATA().TORRENT_PATH) {}

  static async start(saveMetadata: (metadata: Buffer, source: string) => Promise<void>) {
    const importMetadata = new ImportMetadataFiles(saveMetadata);
    await importMetadata.scan();
    return importMetadata;
  }

  async scan() {
    console.log(`Scanning torrent import directory`);
    for (const file of fs.readdirSync(this.dir)) await this.importFile(this.dir, file);

    fs.watch(this.dir, (_, filename) => {
      if (filename) this.importFile(this.dir, filename).catch(console.error);
    });
    console.log('Scanned torrent import directory');
  }

  async importFile(dir: string, file: string) {
    if (!file.endsWith('.torrent')) return;
    const torrentFile = fs.readFileSync(dir + "/" + file);
    try {
      await this.saveMetadata(torrentFile, 'Local');
    } catch (e) {
      console.error(e);
    }
  }
}
