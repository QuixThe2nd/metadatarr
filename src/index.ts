import './log';
import { CONFIG, testConfig } from './config';
import WebTorrent from 'webtorrent';
import { startServer } from './classes/server';
import Qbittorrent from "./classes/qBittorrent";
import OriginalNames from "./startup_tasks/OriginalNames";
import { importMetadataFiles } from "./startup_tasks/ImportMetadataFiles";
import Naming from "./jobs/Naming";
import { sort } from "./jobs/Sort";
import { duplicates } from "./jobs/Duplicates";
import { queue } from './jobs/Queue';
import hook from '../tools/inject';
import type Torrent from './classes/Torrent';
import { logContext } from './log';
import metadata from './jobs/Metadata';
import actions from './jobs/Actions';

await testConfig();

console.log('Starting WebTorrent');
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
console.log('Connecting to qBittorrent');
const api = await Qbittorrent.connect();
const originalNames = await OriginalNames.start();
await startServer(api);

if (!CONFIG.CORE().DEV_INJECT) await importMetadataFiles(webtorrent, api);

const runJobs = async (torrents: Torrent[]): Promise<number> => {
  let changes = 0;
  const tasks = {
    Actions: () => actions(torrents),
    Duplicates: () => duplicates(torrents),
    Sort: () => sort(api, torrents),
    Queue: () => queue(api, torrents),
    Naming: () => Naming.run(torrents, originalNames.names),
    Metadata: () => metadata(torrents, api, webtorrent)
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
