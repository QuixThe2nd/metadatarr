import { SelectorEngine } from "../classes/SelectorEngine";
import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";

const actions = async (torrents: Torrent[]) => {
  const actions = CONFIG.ACTIONS();

  let changes = 0;

  for (const action of actions) {
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = SelectorEngine.execute(selectedTorrents, selector, 'MATCH');
    for (const torrent of selectedTorrents) {
      if (action.then === 'delete') await torrent.delete();
      else if (action.then === 'start') await torrent.start();
      else if (action.then === 'recheck') await torrent.recheck();
      else if (action.then === 'toggleSequentialDownload') await torrent.toggleSequentialDownload();
      else if (action.then === 'setAutoManagement') await torrent.setAutoManagement(action.arg);
      changes++;
    }
  }

  return changes;
}

export default actions;
