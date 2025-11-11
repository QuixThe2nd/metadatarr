import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';
import z from 'zod';

export const ConfigSchema = z.object({
  ENABLED: z.boolean().default(true),
  TAG: z.string().default('!noHL_test')
})

export const hook = async ({ torrents, config }: HookInputs<z.infer<typeof ConfigSchema>>): Promise<Instruction[]> => {
  if (!config.ENABLED) return [];
  const instructions: Instruction[] = [];
  for (const torrent of torrents) {
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
