import './log';
import { CONFIG, testConfig } from './config';
import WebTorrent from 'webtorrent';
import { startServer } from './classes/server';
import Client from "./clients/client";
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

const tasks = {
  Actions: (torrents: Torrent[]) => actions(torrents),
  Duplicates: (torrents: Torrent[]) => duplicates(torrents),
  Sort: (torrents: Torrent[]) => sort(torrents, api),
  Queue: (torrents: Torrent[]) => queue(torrents, api),
  Naming: (torrents: Torrent[]) => Naming.run(torrents, originalNames.names),
  Metadata: (torrents: Torrent[]) => metadata(torrents, api, webtorrent)
} as const;

let jobsRunning = false;
export const runJobs = async (): Promise<number> => {
  if (jobsRunning) return 0;
  jobsRunning = true;
  console.log('Jobs Started');

  let torrents = await api.torrents();

  if (inject !== false) return inject(torrents);

  let changes = 0;
  for (const [name, task] of Object.entries(tasks)) {
    const taskChanges = await logContext(name, async () => {
      console.log('Job Started');
      const taskResult = await task(torrents)
      console.log('Job Finished - Changes:', taskResult.changes);
      if (taskResult.deletes !== undefined) torrents = torrents.filter(t => !taskResult.deletes!.includes(t.hash))
      return taskResult.changes;
    });
    changes += taskChanges;
  }

  console.log('Jobs Finished - Changes:', changes);
  jobsRunning = false;
  return changes;
}

await testConfig();

const api = await Client.connect();
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
const originalNames = await OriginalNames.start();
const inject = CONFIG.CORE().DEV_INJECT ? await hook() : false;
if (inject !== false) await importMetadataFiles(webtorrent, api);

await startServer(api);

for (;;) {
  const changes = await runJobs();
  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 || CONFIG.CORE().DRY_RUN ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
