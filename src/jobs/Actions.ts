import { selectorEngine } from "../classes/SelectorEngine";
import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";

const actions = async (torrents: Torrent[]): Promise<number> => {
  torrents = torrents.sort(Math.random);
  let changes = 0;
  for (const action of CONFIG.ACTIONS()) {
    if ('max' in action && action.max < 1) action.max = action.max > Math.random() ? 1 : 0;
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = selectorEngine.execute(selectedTorrents, selector, true);
    for (let i = 0; i < selectedTorrents.length; i++) {
      if ('max' in action && i === action.max) break;
      const torrent = selectedTorrents[i];
      if (torrent === undefined) throw new Error('wtf happened here');
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
