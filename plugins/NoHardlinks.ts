import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';
import z from 'zod';
import { queryEngine, QuerySchema } from "../src/classes/QueryEngine";
import type Torrent from "../src/classes/Torrent";
import fs from 'fs';

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

const isHardLinked = async (torrent: ReturnType<typeof Torrent>): Promise<boolean | null> => {
  let linked = false;
  const files = (await torrent.files() ?? []).map(file => file.name);
  for (const file of files) {
    const absolutePath = path.join(`${torrent.get().save_path}/`, file)
    if (!fs.existsSync(absolutePath)) return null;
    try {
      if ((await stat(absolutePath)).nlink > 1) linked = true; 
    } catch (e) {
      console.error(e);
    }
  }
  return linked;
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
