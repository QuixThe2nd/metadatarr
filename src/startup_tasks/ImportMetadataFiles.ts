import fs from 'fs';
import { CONFIG } from '../config';
import { saveMetadata } from '../utils/saveMetadata';
import type { Instance } from 'webtorrent';
import type Qbittorrent from '../classes/qBittorrent';

const importFile = async (webtorrent: Instance, qB: Qbittorrent, dir: string, file: string): Promise<void> => {
  if (!file.endsWith('.torrent')) return;
  const torrentFile = fs.readFileSync(`${dir  }/${  file}`);
  try {
    await saveMetadata(webtorrent, qB, torrentFile);
  } catch (e) {
    console.error(e);
  }
}

export const importMetadataFiles = async (webtorrent: Instance, qB: Qbittorrent,): Promise<void> => {
  const dir = CONFIG.METADATA().TORRENT_PATH;

  console.log(`Scanning torrent import directory`);
  for (const file of fs.readdirSync(dir)) await importFile(webtorrent, qB, dir, file);

  fs.watch(dir, (_, filename) => {
    if (filename !== null) importFile(webtorrent, qB, dir, filename).catch(console.error);
  });
  console.log('Scanned torrent import directory');
}
