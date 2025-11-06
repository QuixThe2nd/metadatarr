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

// eslint-disable-next-line complexity
const optimiseInstructions = (instructions: Instruction[]): Instruction[] => {
  const deletes = new Set<string>();
  const addTags: Record<string, string[]> = {};
  const removeTags: Record<string, string[]> = {};
  const rename: Record<string, string> = {};
  const topPriority: string[][] = [];
  const sequentialDownload = new Set<string>();
  let setMaxActiveDownloads: number | undefined;

  for (const instruction of instructions)
    if (instruction.then === 'delete') deletes.add(instruction.hash);
    else if (instruction.then === 'addTags') {
      const existingTags = addTags[instruction.hash] ?? [];
      const newTags = (instruction.arg as string).replace(', ', ',').split(',');
      addTags[instruction.hash] = [...new Set([...existingTags, ...newTags])];
      removeTags[instruction.hash]?.filter(tag => !newTags.includes(tag));
      if (removeTags[instruction.hash]?.length === 0) delete removeTags[instruction.hash];
    } else if (instruction.then === 'removeTags') {
      const existingTags = removeTags[instruction.hash] ?? [];
      const newTags = (instruction.arg as string).replace(', ', ',').split(',');
      removeTags[instruction.hash] = [...new Set([...existingTags, ...newTags])];
      addTags[instruction.hash]?.filter(tag => !newTags.includes(tag));
      if (addTags[instruction.hash]?.length === 0) delete addTags[instruction.hash];
    } else if (instruction.then === 'topPriority') topPriority.push(instruction.arg)
    else if (instruction.then === 'setMaxActiveDownloads') setMaxActiveDownloads = instruction.arg;
    else if (instruction.then === 'rename') rename[instruction.hash] = instruction.arg as string;
    else if (instruction.then === 'toggleSequentialDownload') sequentialDownload.add(instruction.hash);
    else throw new Error(`Unknown Instruction: ${instruction.then}`);

  for (const hash of deletes) {
    delete addTags[hash];
    delete removeTags[hash];
    delete rename[hash];
  }

  const optimisedInstructions: Instruction[] = [
    ...[...deletes].map((hash): Instruction => ({ then: 'delete', hash })),
    ...Object.entries(addTags).map(([hash, tags]): Instruction => ({ then: 'addTags', hash, arg: tags.join(',') })),
    ...Object.entries(removeTags).map(([hash, tags]): Instruction => ({ then: 'removeTags', hash, arg: tags.join(',') })),
    ...Object.entries(rename).map(([hash, name]): Instruction => ({ then: 'rename', hash, arg: name })),
    ...topPriority.map((torrents): Instruction => ({ then: 'topPriority', arg: torrents })),
    ...[...sequentialDownload].map((hash): Instruction => ({ then: 'toggleSequentialDownload', hash }))
  ];
  if (setMaxActiveDownloads !== undefined) optimisedInstructions.push({ then: 'setMaxActiveDownloads', arg: setMaxActiveDownloads });

  console.log('Optimised instructions to:', optimisedInstructions.length);
  return optimisedInstructions;
}

const reduceInstructions = async (instructions: Instruction[], torrents: Record<string, ReturnType<typeof Torrent>>): Promise<Instruction[]> => {
  const maxActiveDownloads = instructions.some(instruction => instruction.then === 'setMaxActiveDownloads') ? await api.getMaxActiveDownloads() : false;

  return instructions.filter(instruction => {
    if (instruction.then === 'topPriority') return true;
    if (instruction.then === 'setMaxActiveDownloads') return maxActiveDownloads !== instruction.arg;

    const torrent = torrents[instruction.hash]?.get();
    if (torrent === undefined) return false;

    if (instruction.then === 'delete') return true;
    else if (instruction.then === 'addTags') {
      const addTags = (instruction.arg as string).split(',');
      return addTags.filter(tag => !torrent.tags.includes(tag)).length !== 0;
    } else if (instruction.then === 'removeTags') {
      const removeTags = (instruction.arg as string).split(',');
      return removeTags.filter(tag => torrent.tags.includes(tag)).length !== 0;
    } else if (instruction.then === 'rename') return torrent.name !== instruction.arg;
    else if (instruction.then === 'toggleSequentialDownload') return true;
    throw new Error(`Unknown Instruction: ${instruction.then}`);
  });
}

let jobsRunning = false;
export const runJobs = async (): Promise<number> => {
  if (jobsRunning) return 0;
  jobsRunning = true;
  console.log('Jobs Started');

  const torrents = await api.torrents();

  const instructions: Instruction[] = [];

  if (inject !== false) instructions.push(...await inject(torrents));
  else
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

  const mappedTorrents = Object.fromEntries(torrents.map(t => [t.get().hash, t]));
  const optimisedInstructions = await reduceInstructions(optimiseInstructions(instructions), mappedTorrents);
  console.log('Reduced instructions to:', optimisedInstructions.length);

  for (const instruction of optimisedInstructions)
    if ('hash' in instruction) {
      const torrent = mappedTorrents[instruction.hash]!;
      if (instruction.then === 'renameFile') await torrent[instruction.then](...instruction.arg);
      else if ('arg' in instruction) await torrent[instruction.then](instruction.arg as never);
      else await torrent[instruction.then]();
    } else await api[instruction.then](instruction.arg)

  return optimisedInstructions.length;
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
  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
