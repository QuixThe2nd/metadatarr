import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';
import z from 'zod';

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  TAG: z.string().default('!noHL_test'),
  MAX_CHECKS: z.number().default(100)
})

export const hook = async ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {
  if (!config.ENABLED) return [];
  const instructions: Instruction[] = [];
  for (let i = 0; i < torrents.length; i++) {
    if (i > config.MAX_CHECKS) break;
    const torrent = torrents[i]!;
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
