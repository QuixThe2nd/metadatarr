import './log.ts';
import { CONFIG, testConfig } from './config.ts';
import WebTorrent from 'webtorrent';
import { startServer } from './services/server.ts';
import Qbittorrent from "./services/qBittorrent.ts";
import OriginalNames from "./helpers/OriginalNames.ts";
import ImportMetadataFiles from "./helpers/ImportMetadataFiles.ts";
import SaveMetadata from './helpers/SaveMetadata.ts';
import Naming from "./jobs/Naming.ts";
import Sort from "./jobs/Sort.ts";
import Duplicates from "./jobs/Duplicates.ts";
import Metadata from "./jobs/Metadata.ts";
import Queue from './jobs/Queue.ts';

testConfig()

console.log('Starting WebTorrent');
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
console.log('Connecting to qBittorrent');
const api = await Qbittorrent.connect();
const originalNames = await OriginalNames.start();
const saveMetadata = new SaveMetadata(api, webtorrent);
await startServer(api);

await ImportMetadataFiles.start((hash: string, metadata: Buffer, source: string) => saveMetadata.save(hash, metadata, source));

const fetchTorrents = async () => {
  const torrents = await api.torrents();

  const config = CONFIG.TORRENTS();
  for (const torrent of torrents) {
    if (config.FORCE_SEQUENTIAL_DOWNLOAD && !torrent.seq_dl) await api.toggleSequentialDownload([torrent.hash]);
    if (config.RESUME_COMPLETED && torrent.state === 'stoppedUP') await api.start([torrent.hash]);
    if (config.RECHECK_MISSING && torrent.state === "missingFiles") await api.recheck([torrent.hash]);
    if (torrent.state === "stoppedDL" && torrent.progress > config.RESUME_ALMOST_FINISHED_THRESHOLD) await api.start([torrent.hash]);
  }

  await Duplicates.run(api, torrents);
  await Sort.run(api, torrents);
  await Queue.run(api, torrents);
  await Naming.run(api, torrents, originalNames.names);
  await Metadata.run(torrents, webtorrent, (hash: string, metadata: Buffer, source: string) => saveMetadata.save(hash, metadata, source));
}

while (true) {
  await fetchTorrents();
  await new Promise(res => setTimeout(res, 10_000));
}
