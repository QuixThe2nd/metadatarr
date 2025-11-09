import type Torrent from './classes/Torrent';
import type Client from './clients/client';
import type { Instruction } from './schemas';

// eslint-disable-next-line max-lines-per-function, complexity
export const optimiseInstructions = (instructions: Instruction[]): Instruction[] => {
  const deletes = new Map<string, boolean>();
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
    if (instruction.then === 'delete') {
      if (deletes.get(instruction.hash) !== true) deletes.set(instruction.hash, instruction.arg);
    } else if (instruction.then === 'recheck') rechecks.add(instruction.hash);
    else if (instruction.then === 'start') {
      starts.add(instruction.hash);
      stops.delete(instruction.hash);
    } else if (instruction.then === 'stop') {
      stops.add(instruction.hash);
      starts.delete(instruction.hash);
    } else if (instruction.then === 'addTags') {
      const existingTags = addTags[instruction.hash] ?? [];
      addTags[instruction.hash] = [...new Set([...existingTags, ...instruction.arg])];
      removeTags[instruction.hash]?.filter(tag => !instruction.arg.includes(tag));
      if (removeTags[instruction.hash]?.length === 0) delete removeTags[instruction.hash];
    } else if (instruction.then === 'removeTags') {
      const existingTags = removeTags[instruction.hash] ?? [];
      removeTags[instruction.hash] = [...new Set([...existingTags, ...instruction.arg])];
      addTags[instruction.hash]?.filter(tag => !instruction.arg.includes(tag));
      if (addTags[instruction.hash]?.length === 0) delete addTags[instruction.hash];
    } else if (instruction.then === 'topPriority') topPriority.push(instruction.arg)
    else if (instruction.then === 'setMaxActiveDownloads') setMaxActiveDownloads = instruction.arg;
    else if (instruction.then === 'rename') rename[instruction.hash] = instruction.arg;
    else if (instruction.then === 'toggleSequentialDownload') sequentialDownload.add(instruction.hash);
    else throw new Error(`Unknown Instruction: ${instruction.then}`);

  for (const [hash] of deletes) {
    delete addTags[hash];
    delete removeTags[hash];
    delete rename[hash];
    sequentialDownload.delete(hash);
    starts.delete(hash);
    stops.delete(hash);
    rechecks.delete(hash);
  }

  const optimisedInstructions: Instruction[] = [
    ...[...deletes].map(([hash, arg]): Instruction => ({ then: 'delete', hash, arg })),
    ...Object.entries(addTags).map(([hash, arg]): Instruction => ({ then: 'addTags', hash, arg })),
    ...Object.entries(removeTags).map(([hash, arg]): Instruction => ({ then: 'removeTags', hash, arg })),
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

export const reduceInstructions = async (client: Client, instructions: Instruction[], torrents: Record<string, ReturnType<typeof Torrent>>): Promise<Instruction[]> => {
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
    throw new Error(`Unknown Instruction: ${instruction.then}`);
  });
}