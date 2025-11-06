import './log';
import { CONFIG, testConfig } from './config';
import WebTorrent from 'webtorrent';
import { startServer } from './classes/server';
import Client from "./clients/client";
import OriginalNames from "./startup_tasks/OriginalNames";
import { importMetadataFiles } from "./startup_tasks/ImportMetadataFiles";
import Naming from "./jobs/Naming";
import { Sort } from "./jobs/Sort";
import { Queue } from './jobs/Queue';
import hook from '../tools/inject';
import type Torrent from './classes/Torrent';
import { logContext } from './log';
import metadata from './jobs/Metadata';
import Actions from './jobs/Actions';
import { properties } from './classes/Torrent';
import { argedActions, filteredActions } from './schemas';
import type { Instruction } from './Types';
// import { Stats } from './jobs/Stats';

if (CONFIG.CORE().DRY_RUN) {
  console.log("======== PROPERTIES ========")
  Object.entries(properties).forEach(type => {
    console.log(`|\n| ${type[0]}:`)
    Object.keys(type[1]).forEach(property => {
      console.log(`| - ${property}`)
    })
  })
  console.log("|\n======== PROPERTIES ========\n")
  console.log("======== ACTIONS ========")
  console.log('|\n| Actions:')
  console.log(`| - ${filteredActions.join("()\n| - ")}()`)
  console.log(`| - ${argedActions.join("(xxxx)\n| - ")}(xxxx)`)
  console.log("|\n======== ACTIONS ========")
}

const tasks = {
  Actions,
  Sort,
  Queue,
  Naming: (torrents: ReturnType<typeof Torrent>[]): Promise<Instruction[]> => Naming.run(torrents, originalNames.names),
  Metadata: (torrents: ReturnType<typeof Torrent>[]): Promise<[]> => metadata(torrents, api, webtorrent),
  // Stats,
} satisfies Record<string, (t: ReturnType<typeof Torrent>[]) => Promise<Instruction[]> | Instruction[]>;

let jobsRunning = false;
export const runJobs = async (): Promise<Instruction[]> => {
  if (jobsRunning) return [];
  jobsRunning = true;
  console.log('Jobs Started');

  const torrents = await api.torrents();

  if (inject !== false) return inject(torrents);

  const instructions: Instruction[] = [];
  for (const [name, task] of Object.entries(tasks)) {
    const taskInstructions = await logContext(name, async () => {
      console.log('Job Started');
      const taskInstructions = await task(torrents);
      console.log('Job Finished - Instructions:', taskInstructions.length);
      // if (taskResult.deletes !== undefined) {
      //   const deletesToRemove = taskResult.deletes;
      //   torrents = torrents.filter(t => !deletesToRemove.includes(t.get().hash));
      // }
      return taskInstructions;
    });
    instructions.push(...taskInstructions);
  }

  console.log('Jobs Finished - Instructions:', instructions.length);
  jobsRunning = false;
  return instructions;
}

await testConfig();

const api = await Client.connect();
const webtorrent = new WebTorrent({ downloadLimit: 1024 });
const originalNames = await OriginalNames.start();
const inject = CONFIG.CORE().DEV_INJECT ? await hook() : false;
if (inject !== false) await importMetadataFiles(webtorrent, api);

await startServer(api);

for (;;) {
  const instructions = await runJobs();
  // TODO: run instructions
  await new Promise(res => setTimeout(res, CONFIG.CORE()[instructions.length === 0 ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
