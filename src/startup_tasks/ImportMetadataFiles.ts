import fs from 'fs';
import { CONFIG } from '../config';
import { saveMetadata } from '../utils/saveMetadata';
import type { Instance } from 'webtorrent';
import type Client from '../clients/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const importFile = async (webtorrent: Instance, client: Client, dir: string, file: string): Promise<void> => {
  if (!file.endsWith('.torrent')) return;
  const torrentFile = fs.readFileSync(`${dir  }/${  file}`);
  try {
    await saveMetadata(webtorrent, client, torrentFile);
  } catch (e) {
    console.error(e);
  }
}

export const importMetadataFiles = async (webtorrent: Instance, client: Client): Promise<void> => {
  const dir = path.join(__dirname, '/../../', CONFIG.METADATA().TORRENT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  console.log(`Scanning torrent import directory`);
  for (const file of fs.readdirSync(dir)) await importFile(webtorrent, client, dir, file);

  fs.watch(dir, (_, filename) => {
    if (filename !== null) importFile(webtorrent, client, dir, filename).catch(console.error);
  });
  console.log('Scanned torrent import directory');
}
