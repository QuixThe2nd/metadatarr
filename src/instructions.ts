import type Torrent from './classes/Torrent';
import type Client from './clients/client';
import { logContext } from './log';
import type { AttributedInstruction } from './plugins';

interface Actions {
  start: { arg: boolean, plugin: string } | undefined;
  autoManagement: { arg: boolean, plugin: string } | undefined;
  name: { arg: string, plugin: string } | undefined;
  category: { arg: string, plugin: string } | undefined;
  toggleSequentialDownloads: { arg: true, plugin: string } | undefined;
  recheck: { arg: true, plugin: string } | undefined;
  addTags: Map<string, string>;
  removeTags: Map<string, string>;
}

// eslint-disable-next-line max-lines-per-function, complexity
const optimiseInstructions = (instructions: AttributedInstruction[]): AttributedInstruction[] => {
  const torrents = new Map<string, Actions>();
  const deletes = new Map<string, { arg: boolean, plugin: string }>();
  const topPriority: string[][] = [];
  let setMaxActiveDownloads: number | undefined;

  for (const instruction of instructions)
    if (instruction.then === 'setMaxActiveDownloads') setMaxActiveDownloads = instruction.arg;
    else if (instruction.then === 'topPriority') topPriority.push(instruction.arg)
    else {
      const { hash } = instruction;
      if (deletes.has(hash)) continue;
      if (!torrents.has(hash)) torrents.set(hash, {
        addTags: new Map(),
        removeTags: new Map(),
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
        if (deletes.get(hash)?.arg !== true) deletes.set(hash, { arg: instruction.arg, plugin: instruction.plugin });
        torrents.delete(hash);
      } else if (instruction.then === 'recheck') torrent.recheck = { arg: true, plugin: instruction.plugin };
      else if (instruction.then === 'start') torrent.start = { arg: true, plugin: instruction.plugin };
      else if (instruction.then === 'stop') torrent.start = { arg: false, plugin: instruction.plugin };
      else if (instruction.then === 'addTags') {
        instruction.arg.forEach(tag => torrent.addTags.set(tag, instruction.plugin));
        instruction.arg.forEach(tag => torrent.removeTags.delete(tag));
      } else if (instruction.then === 'removeTags') {
        instruction.arg.forEach(tag => torrent.removeTags.set(tag, instruction.plugin));
        instruction.arg.forEach(tag => torrent.addTags.delete(tag));
      } else if (instruction.then === 'rename') torrent.name = { arg: instruction.arg, plugin: instruction.plugin };
      else if (instruction.then === 'toggleSequentialDownload') torrent.toggleSequentialDownloads = { arg: true, plugin: instruction.plugin };
      else if (instruction.then === 'setAutoManagement') torrent.autoManagement = { arg: instruction.arg, plugin: instruction.plugin };
      else if (instruction.then === 'setCategory') torrent.category = { arg: instruction.arg, plugin: instruction.plugin };
      else throw new Error(`Unknown Instruction: ${instruction.then}`);
  }

  const optimisedInstructions: AttributedInstruction[] = [
    ...[...deletes].map(([hash, { arg, plugin }]): AttributedInstruction => ({ then: 'delete', hash, arg, plugin })),
    ...topPriority.map((torrents): AttributedInstruction => ({ then: 'topPriority', arg: torrents, plugin: 'unknown' })),
    // eslint-disable-next-line complexity
    ...[...torrents].flatMap(([hash, actions]): AttributedInstruction[] => {
      const instructions: AttributedInstruction[] = [];
      if (actions.start?.arg === true) instructions.push({ hash, then: 'start', plugin: actions.start.plugin });
      else if (actions.start?.arg === false) instructions.push({ hash, then: 'stop', plugin: actions.start.plugin });
      if (actions.recheck?.arg === true) instructions.push({ hash, then: 'recheck', plugin: actions.recheck.plugin });
      if (actions.toggleSequentialDownloads?.arg === true) instructions.push({ hash, then: 'toggleSequentialDownload', plugin: actions.toggleSequentialDownloads.plugin });
      if (actions.autoManagement !== undefined) instructions.push({ hash, then: 'setAutoManagement', ...actions.autoManagement });
      if (actions.name !== undefined) instructions.push({ hash, then: 'rename', ...actions.name });
      if (actions.category !== undefined) instructions.push({ hash, then: 'setCategory', ...actions.category });
      if (actions.addTags.size) instructions.push({ hash, then: 'addTags', arg: [...actions.addTags.keys()], plugin: [...actions.addTags.values()][0] ?? 'unknown' });
      if (actions.removeTags.size) instructions.push({ hash, then: 'removeTags', arg: [...actions.removeTags.keys()], plugin: [...actions.removeTags.values()][0] ?? 'unknown' });
      return instructions;
    })
  ];
  if (setMaxActiveDownloads !== undefined) optimisedInstructions.push({ then: 'setMaxActiveDownloads', arg: setMaxActiveDownloads, plugin: 'unknown' });

  console.log('Optimised instructions to:', optimisedInstructions.length);
  return optimisedInstructions;
}

const reduceInstructions = async (client: Client, instructions: AttributedInstruction[], torrents: Record<string, ReturnType<typeof Torrent>>): Promise<AttributedInstruction[]> => {
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

export const compileInstructions = (instructions: AttributedInstruction[], client: Client, torrents: Record<string, ReturnType<typeof Torrent>>): Promise<AttributedInstruction[]> => logContext('compiler', async () => {
  console.log('Compiling Instructions:', instructions.length);
  const compiledInstructions = await reduceInstructions(client, optimiseInstructions(instructions), torrents);
  console.log('Reduced instructions to:', compiledInstructions.length);
  return compiledInstructions;
});
