import { SelectorEngine } from "../classes/SelectorEngine";
import Torrent from "../classes/Torrent";
import { CONFIG } from "../config";

const actions = async (torrents: Torrent[]) => {
  let changes = 0;
  for (const action of CONFIG.ACTIONS()) {
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = SelectorEngine.execute(selectedTorrents, selector, true);
    for (const torrent of selectedTorrents) {
      if ('arg' in action) await torrent[action.then](action.arg);
      else await torrent[action.then]();
      changes++;
    }
  }
  return changes;
}

export default actions;
