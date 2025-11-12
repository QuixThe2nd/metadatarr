import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';
import z from 'zod';
import { queryEngine, QuerySchema } from "../src/classes/QueryEngine";
import type Torrent from "../src/classes/Torrent";
import fs from 'fs';
import { CacheEngine } from '../src/classes/CacheEngine';

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  TAG: z.string().default('!noHL_test'),
  MAX_CHECKS: z.number().default(0),
  FILTERS: QuerySchema.default({
    key: 'category',
    comparator: '==',
    value: ['lidarr', 'radarr', 'readarr', 'sonarr', 'cross-seed-links']
  })
})

const requiredFilters: z.infer<typeof QuerySchema> = { key: 'progress', comparator: '==', value: 1 };

const cacheEngine = new CacheEngine({ name: 'hardlinks' });

const isFileHardLinked = async (path: string): Promise<boolean | null> => {
  if (!fs.existsSync(path)) return null;
  try {
    if ((await stat(path)).nlink > 1) return true; 
  } catch (e) {
    console.error(e);
  }
  return false;
}

const isHardLinked = async (torrent: ReturnType<typeof Torrent>): Promise<boolean | null> => {
  const files = (await torrent.files() ?? []).map(file => file.name);
  for (const file of files) {
    const filePath = path.join(`${torrent.get().save_path}/`, file);
    const cachedResult = cacheEngine.get(filePath);
    if (cachedResult !== undefined) {
      const result = JSON.parse(cachedResult);
      if (result === true || result === null) return result;
    } else {
      const result = await isFileHardLinked(filePath);
      cacheEngine.set(filePath, JSON.stringify(result), 1_000*60*60*24);
      if (result === true || result === null) return result;
    }
  }
  return false;
}

export const hook = async ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {
  if (!config.ENABLED) return [];
  torrents = queryEngine.execute(queryEngine.execute(torrents, config.FILTERS, true), requiredFilters, true).sort(() => Math.random() - 0.5);
  const instructions: Instruction[] = [];
  for (let i = 0; i < torrents.length; i++) {
    if (config.MAX_CHECKS > 0 && i > config.MAX_CHECKS) break;
    const torrent = torrents[i];
    if (torrent === undefined) continue;
    instructions.push({
      hash: torrent.get().hash,
      then: await isHardLinked(torrent) === false ? 'addTags' : 'removeTags',
      arg: [config.TAG]
    });
  }
  return instructions;
}
