import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import z from 'zod';
import type Torrent from './classes/Torrent';
import Client from './clients/client';
import { InstructionSchema, type Instruction } from './schemas';
import type { Request, Response } from 'express';
import hook from '../tools/inject';
import { logContext } from './log';
import { reduceInstructions, optimiseInstructions } from './instructions';
import { CONFIG, parseConfigFile } from './config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.join(__dirname, '../plugins/');

const HookSchema = z.function({
  input: [z.object({ torrents: z.array(z.object({ get: z.function() })), client: z.instanceof(Client), config: z.object().loose() })],
  output: z.promise(z.array(InstructionSchema))
});

const EndpointSchema = z.function({
  input: [z.record(z.string(), z.unknown()), z.record(z.string(), z.unknown())],
  output: z.promise(z.void()),
});
const PluginExports = z.object({
  hook: HookSchema,
  endpoint: EndpointSchema,
  ConfigSchema: z.instanceof(z.ZodObject)
}).partial();

export interface HookInputs<Config extends Record<string, unknown> = Record<string, unknown>> {
  torrents: ReturnType<typeof Torrent>[];
  client: Client;
  config: Config;
}

type Hook = (hookInputs: HookInputs) => Promise<Instruction[]>;
export type Hooks = Record<string, { hook: Hook, ConfigSchema: z.ZodObject | undefined }>;

type Endpoint = (req: Request, res: Response) => Promise<void>;
export type PluginEndpoints = Map<string, Endpoint>;

export const importPlugins = (): Promise<{ hooks: Hooks, endpoints: PluginEndpoints }> => logContext('plugins', async () => {
  const hooks: Hooks = {};
  const endpoints: PluginEndpoints = new Map();

  console.log('Importing');
  for (const file of fs.readdirSync(pluginDir)) {
    if (file.startsWith('_')) continue;
    const name = file.replace(/\.[tj]s/i, '');
    console.log('Importing Plugin:', name);

    const pluginExports = PluginExports.parse(await import(path.join(pluginDir, file)));
    if (pluginExports.endpoint !== undefined) {
      const endpoint: Endpoint = async (inputs) => await EndpointSchema.implementAsync(pluginExports.endpoint)(inputs);
      endpoints.set(name, endpoint);
    } if (pluginExports.hook !== undefined) {
      const hook: Hook = async (inputs) => await HookSchema.implementAsync(pluginExports.hook)(inputs);
      hooks[name] = { hook, ConfigSchema: pluginExports.ConfigSchema };
    }
  }

  return { hooks, endpoints };
})

const client = await Client.connect()

let pluginsRunning = false;
export const runHooks = (hooks: Hooks): Promise<number> => logContext('plugins', async () => {
  if (pluginsRunning) return 0;
  pluginsRunning = true;

  const coreConfig = CONFIG.CORE();

  const torrents = await client.torrents();

  const instructions: Instruction[] = [];
  await logContext('hook', async () => {
    console.log('Running hooks');
    if (coreConfig.DEV_INJECT) instructions.push(...await logContext('inject', () => hook({ torrents, client, config: {} })));
    else
      for (const [name, { hook, ConfigSchema }] of Object.entries(hooks))
        instructions.push(...await logContext(name, async () => {
          console.log('Hooking');
          const configSchema = ConfigSchema ?? z.object({})
          const config: z.infer<typeof configSchema> = parseConfigFile(`plugins/${name}.jsonc`, configSchema);
          const pluginInstructions = await hook({ torrents, client, config });
          console.log('Done hooking - Instructions:', pluginInstructions.length);
          return pluginInstructions;
        }));

    console.log('Done running hooks');
  });
  pluginsRunning = false;

  const mappedTorrents = Object.fromEntries(torrents.map(t => [t.get().hash, t]));
  const optimisedInstructions = await logContext('compiler', async () => {
    const optimisedInstructions = await reduceInstructions(client, optimiseInstructions(instructions), mappedTorrents)
    console.log('Reduced instructions to:', optimisedInstructions.length);
    return optimisedInstructions;
  });

  for (const instruction of optimisedInstructions) {
    if ('hash' in instruction) {
      const torrent = mappedTorrents[instruction.hash];
      if (torrent === undefined) continue;
      if (instruction.then === 'renameFile') await torrent[instruction.then](...instruction.arg);
      else if ('arg' in instruction) await torrent[instruction.then](instruction.arg as never);
      else await torrent[instruction.then]();
    } else if (instruction.then === 'setMaxActiveDownloads') await client[instruction.then](instruction.arg);
    else await client[instruction.then](instruction.arg);
    await new Promise(res => setTimeout(res, instruction.then === 'topPriority' ? coreConfig.MOVE_WAIT : coreConfig.INSTRUCTION_WAIT));
  }

  return optimisedInstructions.length;
});

// TODO: move old config comments to zod .describe()
