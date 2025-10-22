import type Torrent from "../classes/Torrent";

export const Stats = (torrents: Torrent[]): { changes: 0 } => {
  const trackers: Record<string, { ul: number; dl: number, torrents: number }> = {};
  for (const torrent of torrents) {
    const tracker = torrent.tags.find(t => t.startsWith('@'))
    if (tracker === undefined) continue;
    if (trackers[tracker]) {
      trackers[tracker].ul += torrent.uploaded;
      trackers[tracker].dl += torrent.downloaded;
      trackers[tracker].torrents++;
    } else trackers[tracker] = { ul: torrent.uploaded, dl: torrent.downloaded, torrents: 1 }
  }

  console.log('Trackers:')
  for (const [tracker, stats] of Object.entries(trackers)) {
    console.log(`${tracker}:`)
    console.log('  Ratio:', stats.ul === 0 ? 0 : Math.round(100 * stats.ul / stats.dl)/100)
    console.log('  Torrents:', stats.torrents)
  }

  return { changes: 0 };
}
