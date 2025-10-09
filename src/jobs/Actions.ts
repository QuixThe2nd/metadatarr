import { SelectorEngine } from "../classes/SelectorEngine";
import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";

const actions = async (torrents: Torrent[]) => {
  const actions = CONFIG.ACTIONS();

  let changes = 0;

  for (const action of actions) {
    const results: Torrent[][] = []
    for (const selector of action.if) {
      results.push(SelectorEngine.execute(torrents, selector, 'MATCH'))
    }
    const intersection = results.reduce((acc, curr) => acc.filter(item => curr.includes(item)))
    for (const torrent of intersection) {
      if (action.then === 'delete') await torrent.delete();
      else if (action.then === 'start') await torrent.start();
      else if (action.then === 'recheck') await torrent.recheck();
      else if (action.then === 'toggleSequentialDownload') await torrent.toggleSequentialDownload();
      changes++;
    }
  }

  return changes;
}

export default actions;
