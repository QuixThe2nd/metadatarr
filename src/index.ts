import './log';
import { CONFIG, testConfig } from './config';
import WebTorrent from 'webtorrent';
import { startServer } from './classes/server';
import Client from "./clients/client";
import OriginalNames from "./startup_tasks/OriginalNames";
import { importMetadataFiles } from "./startup_tasks/ImportMetadataFiles";
import Naming from "./jobs/Naming";
import { sort } from "./jobs/Sort";
import { queue } from './jobs/Queue';
import hook from '../tools/inject';
import type Torrent from './classes/Torrent';
import { logContext } from './log';
import metadata from './jobs/Metadata';
import Actions from './jobs/Actions';
// import { Stats } from './jobs/Stats';

const tasks = {
  Actions,
  Sort: (torrents: ReturnType<typeof Torrent>[]): Promise<{ changes: number }> => sort(torrents, api),
  Queue: (torrents: ReturnType<typeof Torrent>[]): Promise<{ changes: number }> => queue(torrents, api),
  Naming: (torrents: ReturnType<typeof Torrent>[]): Promise<{ changes: number }> => Naming.run(torrents, originalNames.names),
  Metadata: (torrents: ReturnType<typeof Torrent>[]): Promise<{ changes: number }> => metadata(torrents, api, webtorrent),
  // Stats,
} satisfies Record<string, (t: ReturnType<typeof Torrent>[]) => Promise<{ changes: number; deletes?: string[] }>>;

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
      const taskResult = await task(torrents) as { changes: number; deletes?: string[] };
      console.log('Job Finished - Changes:', taskResult.changes);
      if (taskResult.deletes !== undefined) {
        const deletesToRemove = taskResult.deletes;
        torrents = torrents.filter(t => !deletesToRemove.includes(t.get().hash));
      }
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
