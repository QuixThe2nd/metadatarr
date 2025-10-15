import { selectorEngine } from "../classes/SelectorEngine";
import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";

const actions = async (torrents: Torrent[]): Promise<number> => {
  let changes = 0;
  for (const action of CONFIG.ACTIONS()) {
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = selectorEngine.execute(selectedTorrents, selector, true);
    for (const torrent of selectedTorrents) {
      // const lastChanges = changes;
      if ('arg' in action) changes += await torrent[action.then](action.arg);
      else changes += await torrent[action.then]();
      // if (lastChanges !== changes) console.log(action.if.map(selector => {
      //   const { key, comparator, ...rest } = selector;
      //   console.log(key, torrent[key])
      //   return `${key} ${comparator} ${'includes' in rest ? rest.includes : 'threshold' in rest ? rest.threshold : ''}`;
      // }).join(' && '))
    }
  }
  return changes;
}

export default actions;
