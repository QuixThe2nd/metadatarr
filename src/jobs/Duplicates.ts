import { CONFIG } from "../config";
import type Torrent from "../classes/Torrent";
import { selectorEngine } from "../classes/SelectorEngine";

const downloadStates = ["stalledDL", "checkingDL", "queuedDL", "stoppedDL", "forcedDL", "downloading", "metaDL"];

export const duplicates = async (torrents: Torrent[]): Promise<number> => {
  const config = CONFIG.DUPLICATES();
  if (config.DOWNLOADS_ONLY) torrents = torrents.filter(torrent => downloadStates.includes(torrent.state));
  if (config.IGNORE_TAG) torrents = torrents.filter(torrent => !torrent.tags.includes(config.IGNORE_TAG));
  for (const sort of config.TIE_BREAKERS) torrents = selectorEngine.execute(torrents, sort, false);

  const keptTorrents = new Map<string, Torrent>();
  let changes = 0;
  for (const torrent of torrents) 
    if (!keptTorrents.has(torrent.name)) keptTorrents.set(torrent.name, torrent);
    else {
      await torrent.delete();
      changes++;
    }
  
  return changes;
}
