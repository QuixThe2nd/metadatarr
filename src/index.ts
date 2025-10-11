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
import metadata from './jobs/Metadata.ts';
import actions from './jobs/Actions.ts';

await testConfig();

console.log('Starting WebTorrent');
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
console.log('Connecting to qBittorrent');
const api = await Qbittorrent.connect();
const originalNames = await OriginalNames.start();
const saveMetadata = new SaveMetadata(api, webtorrent);
await startServer(api);

if (!CONFIG.CORE().DEV_INJECT) await ImportMetadataFiles.start((metadata: Buffer, source: string) => saveMetadata.save(metadata, source));

const runJobs = async (torrents: Torrent[]): Promise<number> => {
  let changes = 0;
  const tasks = {
    // Actions: () => actions(torrents), // TODO: test in dry run mode
    Duplicates: () => Duplicates.run(torrents),
    Sort: () => Sort.run(api, torrents),
    Queue: () => Queue.run(api, torrents),
    Naming: () => Naming.run(torrents, originalNames.names),
    Metadata: () => metadata(torrents, webtorrent, (metadata: Buffer, source: string) => saveMetadata.save(metadata, source))
  } as const;
  for (const [name, task] of Object.entries(tasks)) {
    const taskChanges = await logContext(name, async () => {
      console.log('Job Started');
      const taskChanges = await task()
      console.log('Job Finished - Changes:', taskChanges);
      return taskChanges;
    });
    changes += taskChanges;
  }
  return changes;
}

for (;;) {
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

  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 || CONFIG.CORE().DRY_RUN ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
