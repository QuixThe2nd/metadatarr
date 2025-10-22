import { selectorEngine } from "../classes/SelectorEngine";
import type Torrent from "../classes/Torrent";
import { CONFIG } from "../config";
import type { Action } from "../schemas";

const runAction = async (torrent: Torrent, action: Action): Promise<{ changes: number; deleted: boolean }> => {
  let changes = 0;
  let deleted = false;
  if ('arg' in action) changes += await torrent[action.then](action.arg);
  else changes += await torrent[action.then]();
  if (action.then === 'delete') deleted = true;
  return { changes, deleted }
}

const Actions = async (torrents: Torrent[]): Promise<{ changes: number, deletes: string[] }> => {
  const deletes: string[] = [];
  torrents = torrents.sort(Math.random);
  let changes = 0;
  for (const action of CONFIG.ACTIONS().ACTIONS) {
    if ('max' in action && action.max < 1) action.max = action.max > Math.random() ? 1 : 0;
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = selectorEngine.execute(selectedTorrents, selector, true);
    for (let i = 0; i < selectedTorrents.length; i++) {
      if ('max' in action && i === action.max) break;
      const torrent = selectedTorrents[i]!;
      const result = await runAction(torrent, action);
      changes += result.changes;
      if (result.deleted) deletes.push(torrent.hash);
    }
  }
  return { changes, deletes };
}

export default Actions;
