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

const tasks = (torrents: Torrent[]) => ({
  Actions: () => actions(torrents),
  Duplicates: () => duplicates(torrents),
  Sort: () => sort(torrents, api),
  Queue: () => queue(torrents, api),
  Naming: () => Naming.run(torrents, originalNames.names),
  Metadata: () => metadata(torrents, api, webtorrent)
}) as const;

let jobsRunning = false;
export const runJobs = async (): Promise<number> => {
  if (jobsRunning) return 0;
  jobsRunning = true;
  console.log('Jobs Started');

  const torrents = await api.torrents();

  if (inject !== false) return inject(torrents);

  let changes = 0;
  for (const [name, task] of Object.entries(tasks(torrents))) {
    const taskChanges = await logContext(name, async () => {
      console.log('Job Started');
      const taskChanges = await task()
      console.log('Job Finished - Changes:', taskChanges);
      return taskChanges;
    });
    changes += taskChanges;
  }

  console.log('Jobs Finished - Changes:', changes);
  jobsRunning = false;
  return changes;
}

await testConfig();

const api = await Qbittorrent.connect();
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
const originalNames = await OriginalNames.start();
const inject = CONFIG.CORE().DEV_INJECT ? await hook() : false;
if (inject !== false) await importMetadataFiles(webtorrent, api);

await startServer(api);

for (;;) {
  const changes = await runJobs();
  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 || CONFIG.CORE().DRY_RUN ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
