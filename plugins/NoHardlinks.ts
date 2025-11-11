import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';
import z from 'zod';
import { queryEngine, QuerySchema } from "../src/classes/QueryEngine";

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  TAG: z.string().default('!noHL_test'),
  MAX_CHECKS: z.number().default(100),
  FILTERS: QuerySchema.default({
    key: 'category',
    comparator: '==',
    value: ['lidarr', 'radarr', 'readarr', 'sonarr', 'cross-seed-links']
  })
})

const requiredFilters: z.infer<typeof QuerySchema> = { key: 'progress', comparator: '==', value: 1 };

export const hook = async ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {
  if (!config.ENABLED) return [];
  torrents = queryEngine.execute(queryEngine.execute(torrents, config.FILTERS, true), requiredFilters, true).sort(() => Math.random() - 0.5);
  const instructions: Instruction[] = [];
  for (let i = 0; i < torrents.length; i++) {
    if (i > config.MAX_CHECKS) break;
    const torrent = torrents[i];
    if (torrent === undefined) continue;
    const { hash, save_path } = torrent.get();
    let linked = false;
    const files = (await torrent.files() ?? []).map(file => file.name);
    for (const file of files) {
      const absolutePath = path.join(`${save_path}/`, file)
      try {
        if ((await stat(absolutePath)).nlink > 1) linked = true; 
      } catch (e) {
        console.error(e);
      }
    }
    instructions.push({ hash, then: linked ? 'removeTags' : 'addTags', arg: [config.TAG] })
  }
  return instructions;
}
