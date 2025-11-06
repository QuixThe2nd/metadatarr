import './log';
import { CONFIG, testConfig } from './config';
import { startServer } from './classes/server';
import Client from "./clients/client";
import hook from '../tools/inject';
import type Torrent from './classes/Torrent';
import { logContext } from './log';
import { properties } from './classes/Torrent';
import { argedActions, filteredActions, InstructionSchema, type Instruction } from './schemas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import z from 'zod';

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

const CorePluginSchema = z.array(z.object({
  get: z.function()
}));
const PluginSchema = z.function({
  input: [CorePluginSchema, z.object().loose()],
  output: z.array(InstructionSchema)
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginDir = path.join(__dirname, '../plugins/');

const plugins: Record<string, (t: ReturnType<typeof Torrent>[], client: Client) => Promise<Instruction[]> | Instruction[]> = {};
for (const pluginName of fs.readdirSync(pluginDir)) {
  if (pluginName.startsWith('_')) continue;
  const { default: plugin } = await import(path.join(pluginDir, pluginName));
  const importedPlugin = PluginSchema.implementAsync(plugin);
  plugins[pluginName.replace(/\.[tj]s/i, '')] = importedPlugin;
}

// Metadata: (torrents: ReturnType<typeof Torrent>[]): Promise<[]> => metadata(torrents, api, webtorrent),

// eslint-disable-next-line max-lines-per-function, complexity
const optimiseInstructions = (instructions: Instruction[]): Instruction[] => {
  const deletes = new Set<string>();
  const starts = new Set<string>();
  const stops = new Set<string>();
  const rechecks = new Set<string>();
  const addTags: Record<string, string[]> = {};
  const removeTags: Record<string, string[]> = {};
  const rename: Record<string, string> = {};
  const topPriority: string[][] = [];
  const sequentialDownload = new Set<string>();
  let setMaxActiveDownloads: number | undefined;

  for (const instruction of instructions)
    if (instruction.then === 'delete') deletes.add(instruction.hash);
    else if (instruction.then === 'recheck') rechecks.add(instruction.hash);
    else if (instruction.then === 'start') {
      starts.add(instruction.hash);
      stops.delete(instruction.hash);
    } else if (instruction.then === 'stop') {
      stops.add(instruction.hash);
      starts.delete(instruction.hash);
    } else if (instruction.then === 'addTags') {
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
    starts.delete(hash);
    stops.delete(hash);
    rechecks.delete(hash);
  }

  const optimisedInstructions: Instruction[] = [
    ...[...deletes].map((hash): Instruction => ({ then: 'delete', hash })),
    ...Object.entries(addTags).map(([hash, tags]): Instruction => ({ then: 'addTags', hash, arg: tags.join(',') })),
    ...Object.entries(removeTags).map(([hash, tags]): Instruction => ({ then: 'removeTags', hash, arg: tags.join(',') })),
    ...Object.entries(rename).map(([hash, name]): Instruction => ({ then: 'rename', hash, arg: name })),
    ...topPriority.map((torrents): Instruction => ({ then: 'topPriority', arg: torrents })),
    ...[...sequentialDownload].map((hash): Instruction => ({ then: 'toggleSequentialDownload', hash })),
    ...[...starts].map((hash): Instruction => ({ then: 'start', hash })),
    ...[...stops].map((hash): Instruction => ({ then: 'stop', hash })),
    ...[...rechecks].map((hash): Instruction => ({ then: 'recheck', hash }))
  ];
  if (setMaxActiveDownloads !== undefined) optimisedInstructions.push({ then: 'setMaxActiveDownloads', arg: setMaxActiveDownloads });

  console.log('Optimised instructions to:', optimisedInstructions.length);
  return optimisedInstructions;
}

const reduceInstructions = async (instructions: Instruction[], torrents: Record<string, ReturnType<typeof Torrent>>): Promise<Instruction[]> => {
  const maxActiveDownloads = instructions.some(instruction => instruction.then === 'setMaxActiveDownloads') ? await api.getMaxActiveDownloads() : false;

  // eslint-disable-next-line complexity
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
    else if (instruction.then === 'start') return ['stoppedDL', 'stoppedUP'].includes(torrent.state);
    else if (instruction.then === 'stop') return !['stoppedDL', 'stoppedUP'].includes(torrent.state);
    throw new Error(`Unknown Instruction: ${instruction.then}`);
  });
}

let pluginsRunning = false;
export const runPlugins = async (): Promise<number> => {
  if (pluginsRunning) return 0;
  pluginsRunning = true;
  console.log('Plugins Started');

  const torrents = await api.torrents();

  const instructions: Instruction[] = [];

  if (CONFIG.CORE().DEV_INJECT) instructions.push(...await hook(torrents, api));
  else
    for (const [name, plugin] of Object.entries(plugins)) {
      const pluginInstructions = await logContext(name, async () => {
        console.log('Plugin Started');
        const pluginInstructions = await plugin(torrents, api);
        console.log('Plugin Finished - Instructions:', pluginInstructions.length);
        // if (pluginResult.deletes !== undefined) {
        //   const deletesToRemove = pluginResult.deletes;
        //   torrents = torrents.filter(t => !deletesToRemove.includes(t.get().hash));
        // }
        return pluginInstructions;
      });
      instructions.push(...pluginInstructions);
    }

  console.log('Plugins Finished - Instructions:', instructions.length);
  pluginsRunning = false;

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

await startServer(api);

for (;;) {
  const changes = await runPlugins();
  await new Promise(res => setTimeout(res, CONFIG.CORE()[changes === 0 ? 'NO_JOB_WAIT' : 'JOB_WAIT']));
}
