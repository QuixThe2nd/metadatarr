import { selectorEngine } from "../src/classes/SelectorEngine";
import type Torrent from "../src/classes/Torrent";
import { CONFIG } from "../src/config";
import type { Instruction } from "../src/schemas";

const Actions = (torrents: ReturnType<typeof Torrent>[]): Instruction[] => {
  torrents = torrents.sort(Math.random);
  const instructions: Instruction[] = [];
  for (const action of CONFIG.ACTIONS().ACTIONS) {
    if (action.max !== undefined && action.max < 1) action.max = action.max > Math.random() ? 1 : 0;
    let selectedTorrents = torrents;
    for (const selector of action.if) selectedTorrents = selectorEngine.execute(selectedTorrents, selector, true);
    for (const [i, torrent] of selectedTorrents.entries()) {
      if ('max' in action && i === action.max) continue;
      const { if: _, ...rest } = action;
      instructions.push({ hash: torrent.get().hash, ...rest });
    }
  }
  return instructions;
}

export default Actions;
