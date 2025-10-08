import './log.ts';
import { CONFIG, testConfig } from './config.ts';
import WebTorrent from 'webtorrent';
import { startServer } from './services/server.ts';
import Qbittorrent, { type Torrent } from "./services/qBittorrent.ts";
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

const runJobs = async (torrents: Torrent[]) => {
  let changes = 0;
  const tasks = {
    Duplicates: () => Duplicates.run(api, torrents),
    Sort: () => Sort.run(api, torrents),
    Queue: () => Queue.run(api, torrents),
    Naming: () => Naming.run(api, torrents, originalNames.names),
    Metadata: () => Metadata.run(torrents, webtorrent, (hash: string, metadata: Buffer, source: string) => saveMetadata.save(hash, metadata, source))
  } as const;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  for (const [name, task] of Object.entries(tasks)) {
    console.log = (...args) => originalConsoleLog.apply(console, [`[${name.toUpperCase()}]`, ...args]);
    console.warn = (...args) => originalConsoleWarn.apply(console, [`[${name.toUpperCase()}]`, ...args]);
    console.error = (...args) => originalConsoleError.apply(console, [`[${name.toUpperCase()}]`, ...args]);
    console.log('Job Started');
    const taskChanges = await task();
    changes += taskChanges;
    console.log('Job Finished - Changes:', taskChanges);
  }
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  return changes;
}

while (true) {
  const torrents = await api.torrents();

  let changes = 0;
  const config = CONFIG.TORRENTS();
  for (const torrent of torrents) {
    if (config.FORCE_SEQUENTIAL_DOWNLOAD === 1 && !torrent.seq_dl) {
      changes++;
      await api.toggleSequentialDownload([torrent.hash]);
    }
    if (config.FORCE_SEQUENTIAL_DOWNLOAD === -1 && torrent.seq_dl) {
      changes++;
      await api.toggleSequentialDownload([torrent.hash]);
    }
    if (config.RESUME_COMPLETED && torrent.state === 'stoppedUP') {
      changes++;
      await api.start([torrent.hash]);
    }
    if (config.RECHECK_MISSING && torrent.state === "missingFiles") {
      changes++;
      await api.recheck([torrent.hash]);
    }
    if (torrent.state === "stoppedDL" && torrent.progress > config.RESUME_ALMOST_FINISHED_THRESHOLD) {
      changes++;
      await api.start([torrent.hash]);
    }
  }

  console.log('Jobs Started')
  changes += await runJobs(torrents);
  console.log('Jobs Finished')

  if (changes === 0) await new Promise(res => setTimeout(res, CONFIG.CORE().JOB_WAIT));
}
