import type { HookInputs } from "../src/plugins";
import type { Instruction } from "../src/schemas";
import path from 'path';
import { stat } from 'fs/promises';

const checkLinks = async (filePath: string): Promise<number> => {
  try {
    const stats = await stat(filePath);
    console.log(`File: ${filePath}`);
    console.log(`Hard links: ${stats.nlink}`);
    return stats.nlink;
  } catch (e) {
    console.error('Error checking file:', e);
    throw e;
  }
};

export const hook = async ({ torrents }: HookInputs): Promise<Instruction[]> => {
  for (const torrent of torrents) {
    const files = (await torrent.files() ?? []).map(file => file.name);
    for (const file of files) {
      const absolutePath = path.join(`${torrent.get().save_path}/`, file)
      console.log(absolutePath, checkLinks(absolutePath));
    }
  }
  return [];
}
