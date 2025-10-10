import './log.ts';
import { CONFIG, testConfig } from './config.ts';
import WebTorrent from 'webtorrent';
import { startServer } from './classes/server.ts';
import Qbittorrent from "./classes/qBittorrent.ts";
import OriginalNames from "./helpers/OriginalNames.ts";
import ImportMetadataFiles from "./helpers/ImportMetadataFiles.ts";
import SaveMetadata from './helpers/SaveMetadata.ts';
import Naming from "./jobs/Naming.ts";
import Sort from "./jobs/Sort.ts";
import Duplicates from "./jobs/Duplicates.ts";
import Queue from './jobs/Queue.ts';
import hook from '../tools/inject.ts';
import type Torrent from './classes/Torrent.ts';
import { logContext } from './log.ts';
import Metadata from './jobs/Metadata.ts';
import actions from './jobs/Actions.ts';

await testConfig();

console.log('Starting WebTorrent');
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
console.log('Connecting to qBittorrent');
const api = await Qbittorrent.connect();
const originalNames = await OriginalNames.start();
const saveMetadata = new SaveMetadata(api, webtorrent);
await startServer(api);

if (!CONFIG.CORE().DEV_INJECT) await ImportMetadataFiles.start((hash: string, metadata: Buffer, source: string) => saveMetadata.save(hash, metadata, source));

const runJobs = async (torrents: Torrent[]) => {
  let changes = 0;
  const tasks = {
    // Actions: () => actions(torrents),
    Duplicates: () => Duplicates.run(torrents),
    Sort: () => Sort.run(api, torrents),
    Queue: () => Queue.run(api, torrents),
    Naming: () => Naming.run(torrents, originalNames.names),
    Metadata: () => Metadata.run(torrents, webtorrent, (hash: string, metadata: Buffer, source: string) => saveMetadata.save(hash, metadata, source))
  } as const;
  for (const [name, task] of Object.entries(tasks)) {
    console.log('Job Started');
    const taskChanges = await logContext(name, task);
    changes += taskChanges;
    console.log('Job Finished - Changes:', taskChanges);
  }
  return changes;
}

while (true) {
  const torrents = await api.torrents();

  if (CONFIG.CORE().DEV_INJECT) {
    const inject = await hook();
    await inject(torrents);
    continue;
  }

  let changes = 0;
  console.log('Jobs Started')
  changes += await runJobs(torrents);
  console.log('Jobs Finished')

  if (changes === 0 || CONFIG.CORE().DRY_RUN) await new Promise(res => setTimeout(res, CONFIG.CORE().JOB_WAIT));
}
