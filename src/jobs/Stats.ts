import type Torrent from "../classes/Torrent";
import ptt from 'parse-torrent-title';

type Trackers = Record<string, { ul: number; dl: number, torrents: number }>;
type Releases = Record<string, number>;

const parse = (torrents: Torrent[]): { trackers: Trackers; releases: Releases } => {
  const trackers: Trackers = {};
  const releases: Releases = {};
  for (const torrent of torrents) {
    if (releases[torrent.name]) releases[torrent.name]++;
    else releases[torrent.name] = 1;

    const tracker = torrent.tags.find(t => t.startsWith('@'))
    if (tracker === undefined) continue;
    if (trackers[tracker]) {
      trackers[tracker].ul += torrent.uploaded;
      trackers[tracker].dl += torrent.downloaded;
      trackers[tracker].torrents++;
    } else trackers[tracker] = { ul: torrent.uploaded, dl: torrent.downloaded, torrents: 1 }
  }
  return { trackers, releases };
}

export const Stats = (torrents: Torrent[]): { changes: 0 } => {
  const { trackers, releases } = parse(torrents);

  console.log('Trackers:')
  for (const [tracker, stats] of Object.entries(trackers)) {
    console.log(`${tracker}:`)
    console.log('  Ratio:', stats.ul === 0 ? 0 : Math.round(100 * stats.ul / stats.dl)/100)
    console.log('  Torrents:', stats.torrents)
  }

  const groups: Record<string, number[]> = {};
  for (const [release, count] of Object.entries(releases).sort((a, b) => b[1] - a[1])) {
    const { group } = ptt.parse(release);
    if (group === undefined) continue;
    if (groups[group]) groups[group].push(count);
    else groups[group] = [count];
  }

  const crossSeeds: Record<string, number> = {}
  for (const [group, counts] of Object.entries(groups)) {
    const averageCrossSeeds = counts.reduce((partialSum, a) => partialSum + a, 0) / counts.length;
    if (averageCrossSeeds > 1) crossSeeds[group] = averageCrossSeeds;
  }

  console.log('Cross Seeded Groups:');
  console.log(Object.entries(crossSeeds).sort((a, b) => b[1] - a[1]))

  return { changes: 0 };
}
