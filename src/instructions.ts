import type Torrent from './classes/Torrent';
import type Client from './clients/client';
import { logContext } from './log';
import type { Instruction } from './schemas';

interface Actions {
  start: boolean | undefined;
  autoManagement: boolean | undefined;
  addTags: Set<string>;
  removeTags: Set<string>;
  name: string | undefined;
  category: string | undefined;
  toggleSequentialDownloads: true | undefined;
  recheck: true | undefined;
}

// eslint-disable-next-line max-lines-per-function, complexity
const optimiseInstructions = (instructions: Instruction[]): Instruction[] => {
  const torrents = new Map<string, Actions>();
  const deletes = new Map<string, boolean>();
  const topPriority: string[][] = [];
  let setMaxActiveDownloads: number | undefined;

  for (const instruction of instructions)
    if (instruction.then === 'setMaxActiveDownloads') setMaxActiveDownloads = instruction.arg;
    else if (instruction.then === 'topPriority') topPriority.push(instruction.arg)
    else {
      const { hash } = instruction;
      if (deletes.has(hash)) continue;
      if (!torrents.has(hash)) torrents.set(hash, {
        addTags: new Set(),
        removeTags: new Set(),
        recheck: undefined,
        toggleSequentialDownloads: undefined,
        start: undefined,
        autoManagement: undefined,
        name: undefined,
        category: undefined
      });
      const torrent = torrents.get(hash);
      if (torrent === undefined) throw new Error('Failed to pull torrent?');
      if (instruction.then === 'delete') {
        if (deletes.get(hash) !== true) deletes.set(hash, instruction.arg);
        torrents.delete(hash);
      } else if (instruction.then === 'recheck') torrent.recheck = true;
      else if (instruction.then === 'start') torrent.start = true;
      else if (instruction.then === 'stop') torrent.start = false;
      else if (instruction.then === 'addTags') {
        instruction.arg.forEach(tag => torrent.addTags.add(tag));
        instruction.arg.forEach(tag => torrent.removeTags.delete(tag));
      } else if (instruction.then === 'removeTags') {
        instruction.arg.forEach(tag => torrent.removeTags.add(tag));
        instruction.arg.forEach(tag => torrent.addTags.delete(tag));
      } else if (instruction.then === 'rename') torrent.name = instruction.arg;
      else if (instruction.then === 'toggleSequentialDownload') torrent.toggleSequentialDownloads = true;
      else if (instruction.then === 'setAutoManagement') torrent.autoManagement = instruction.arg;
      else if (instruction.then === 'setCategory') torrent.category = instruction.arg;
      else throw new Error(`Unknown Instruction: ${instruction.then}`);
  }

  const optimisedInstructions: Instruction[] = [
    ...[...deletes].map(([hash, arg]): Instruction => ({ then: 'delete', hash, arg })),
    ...topPriority.map((torrents): Instruction => ({ then: 'topPriority', arg: torrents })),
    ...[...torrents].flatMap(([hash, actions]): Instruction[] => {
      const instructions: Instruction[] = [];
      if (actions.start === true) instructions.push({ hash, then: 'start' });
      else if (actions.start === false) instructions.push({ hash, then: 'stop' });
      if (actions.recheck === true) instructions.push({ hash, then: 'recheck' });
      if (actions.toggleSequentialDownloads === true) instructions.push({ hash, then: 'recheck' });
      if (actions.autoManagement !== undefined) instructions.push({ hash, then: 'setAutoManagement', arg: actions.autoManagement });
      if (actions.name !== undefined) instructions.push({ hash, then: 'rename', arg: actions.name });
      if (actions.category !== undefined) instructions.push({ hash, then: 'setCategory', arg: actions.category });
      if (actions.addTags.size) instructions.push({ hash, then: 'addTags', arg: [...actions.addTags] });
      if (actions.removeTags.size) instructions.push({ hash, then: 'removeTags', arg: [...actions.removeTags] });
      return instructions;
    })
  ];
  if (setMaxActiveDownloads !== undefined) optimisedInstructions.push({ then: 'setMaxActiveDownloads', arg: setMaxActiveDownloads });

  console.log('Optimised instructions to:', optimisedInstructions.length);
  return optimisedInstructions;
}

const reduceInstructions = async (client: Client, instructions: Instruction[], torrents: Record<string, ReturnType<typeof Torrent>>): Promise<Instruction[]> => {
  const maxActiveDownloads = instructions.some(instruction => instruction.then === 'setMaxActiveDownloads') ? await client.getMaxActiveDownloads() : false;

  // eslint-disable-next-line complexity
  return instructions.filter(instruction => {
    if (instruction.then === 'topPriority') return true;
    if (instruction.then === 'setMaxActiveDownloads') return maxActiveDownloads !== instruction.arg;

    const torrent = torrents[instruction.hash]?.get();
    if (torrent === undefined) return false;

    if (instruction.then === 'delete' || instruction.then === 'recheck') return true;
    else if (instruction.then === 'addTags') return instruction.arg.filter(tag => !torrent.tags.includes(tag)).length !== 0;
    else if (instruction.then === 'removeTags') return instruction.arg.filter(tag => torrent.tags.includes(tag)).length !== 0;
    else if (instruction.then === 'rename') return torrent.name !== instruction.arg;
    else if (instruction.then === 'toggleSequentialDownload') return true;
    else if (instruction.then === 'start') return ['stoppedDL', 'stoppedUP'].includes(torrent.state);
    else if (instruction.then === 'stop') return !['stoppedDL', 'stoppedUP'].includes(torrent.state);
    else if (instruction.then === 'setAutoManagement') return torrent.auto_tmm !== instruction.arg;
    else if (instruction.then === 'setCategory') return torrent.category !== instruction.arg;
    throw new Error(`Unknown Instruction: ${instruction.then}`);
  });
}

export const compileInstructions = (instructions: Instruction[], client: Client, torrents: Record<string, ReturnType<typeof Torrent>>): Promise<Instruction[]> => logContext('compiler', async () => {
  console.log('Compiling Instructions:', instructions.length);
  const compiledInstructions = await reduceInstructions(client, optimiseInstructions(instructions), torrents);
  console.log('Reduced instructions to:', compiledInstructions.length);
  return compiledInstructions;
});
