import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';

export const hook = async ({ torrents }: HookInputs): Promise<Instruction[]> => {
  for (const torrent of torrents) {
    let linked = false;
    const files = (await torrent.files() ?? []).map(file => file.name);
    for (const file of files) {
      const absolutePath = path.join(`${torrent.get().save_path}/`, file)
      try {
        if ((await stat(absolutePath)).nlink > 1) linked = true; 
      } catch (e) {
        console.error(e);
      }
    }
    if (!linked) console.log('No hardlink found', torrent.get().hash)
  }
  return [];
}
