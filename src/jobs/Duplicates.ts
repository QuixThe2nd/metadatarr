import type Torrent from "../classes/Torrent";
import { selectorEngine } from "../classes/SelectorEngine";
import { CONFIG } from "../config";

export const Duplicates = async (torrents: Torrent[]): Promise<{ changes: number, deletes: string[] }> => {
  const config = CONFIG.DUPLICATES();
  if (!config.ENABLED) return { changes: 0, deletes: [] }
  for (const filter of config.FILTERS) torrents = selectorEngine.execute(torrents, filter, true);
  for (const sort of config.TIE_BREAKERS) torrents = selectorEngine.execute(torrents, sort, false);

  const deletes: string[] = [];
  const keptTorrents = new Map<string, Torrent>();
  let changes = 0;
  for (const torrent of torrents) 
    if (!keptTorrents.has(torrent.name)) keptTorrents.set(torrent.name, torrent);
    else {
      deletes.push(torrent.hash);
      await torrent.delete();
      changes++;
    }
  
  return { changes, deletes };
}
